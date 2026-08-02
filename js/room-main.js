/**
 * Boot and orchestration for Room to Breathe.
 *
 * All surfaces live here: title, commissions board, brief, the three in-game
 * views, debrief, ending, about, help, settings. The studio owns the room and
 * the simulation; this file owns everything around it.
 */

import { Studio } from './studio.js';
import { KINDS } from './room.js';
import { DOMAINS } from './field.js';
import {
  COMMISSIONS, CAST, GAME, loadProgress, saveProgress, isUnlocked, starsFor,
  finishedRooms
} from './campaign.js';
import { PEOPLE } from './person.js';
import { palette } from './config.js';
import { buildHeat } from './plan.js';
import { View3D } from './view3d.js';
import { Walker } from './walker.js';
import { evaluate, bestMove, applyMove } from './solver.js';
import { SOURCES } from './fragments.js';

const $ = id => document.getElementById(id);

const LAYER_LABEL = {
  load: 'everything', sound: 'noise', light: 'brightness', flicker: 'flicker',
  glare: 'glare', crowd: 'people', clutter: 'clutter', smell: 'smell',
  escape: 'retreat', exposure: 'wayfinding'
};

const OVERLAYS = ['title', 'board', 'brief', 'debrief', 'ending', 'help', 'about', 'settings'];

const READABLE = {
  sound: 'noise', light: 'brightness', flicker: 'flicker', glare: 'glare',
  crowd: 'people close by', clutter: 'visual clutter', smell: 'smell',
  escape: 'nowhere to retreat to', exposure: 'cannot see the way out'
};

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

const PREFS_KEY = 'room-to-breathe.prefs';
const prefs = (() => {
  try { return { style: 'crisp', motion: 'on', text: 'normal', ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; }
  catch { return { style: 'crisp', motion: 'on', text: 'normal' }; }
})();
function savePrefs () {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* fine */ }
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let progress = loadProgress();
let commission = null;
let mode = 'plan';
let walkT = 0;
let orbit = -Math.PI / 4;
let briefTarget = null;
const walker = new Walker();

/* ------------------------------------------------------------------ */
/* Interface plumbing                                                  */
/* ------------------------------------------------------------------ */

const ui = {
  onRoom (s) {
    const idx = COMMISSIONS.indexOf(commission) + 1;
    $('roomCount').textContent = `commission ${idx} of ${COMMISSIONS.length}`;
    $('roomTitle').textContent = commission.title;
    this.syncPersonTabs(s);
    this.syncTray(s);
    this.buildLayers(s);
  },

  syncPersonTabs (s) {
    $('personTabs').innerHTML = s.people.map((p, i) => {
      const r = s.results[i];
      return `<button class="ptab${i === s.viewIdx ? ' on' : ''}${r?.ok ? ' good' : ''}"
        data-i="${i}">${p.name}</button>`;
    }).join('');
    for (const b of $('personTabs').querySelectorAll('.ptab')) {
      b.onclick = () => {
        studio.setViewPerson(+b.dataset.i);
        walkT = 0;
        this.syncPersonTabs(studio);
      };
    }
    $('personBlurb').textContent = s.person.blurb;
  },

  onResult (s) {
    const v = s.verdict();
    if (!v) return;
    $('verdict').classList.toggle('ok', v.ok);
    $('verdict').classList.toggle('owner', !!v.owner);
    $('verdictHead').textContent = v.headline;
    $('verdictDetail').textContent = v.detail;
    $('budgetRead').textContent = `${s.budgetLeft()} of ${s.room.budget}`;
    $('live').textContent = `${v.headline} ${v.detail}`;
    $('signoffBtn').hidden = !(mode === 'plan' && s.ready());
  },

  syncTray (s) {
    const left = s.budgetLeft();
    $('tray').innerHTML = s.room.tray.map(k => {
      const d = KINDS[k];
      const afford = (d.cost ?? 0) <= left;
      return `<button class="tray-item${s.trayPick === k ? ' picked' : ''}"
        data-kind="${k}" ${afford ? '' : 'disabled'}>
        <b>${d.label}</b><span>${d.cost ?? 0}</span></button>`;
    }).join('');
    for (const b of $('tray').querySelectorAll('.tray-item')) {
      b.onclick = () => {
        s.trayPick = s.trayPick === b.dataset.kind ? null : b.dataset.kind;
        this.syncTray(s);
        this.say(s.trayPick ? 'Now click where it goes.' : '');
      };
    }
  },

  buildLayers (s) {
    const all = ['load', ...DOMAINS];
    $('layers').innerHTML = all.map(m =>
      `<button class="layer${m === s.mode ? ' on' : ''}" data-m="${m}">${LAYER_LABEL[m] ?? m}</button>`
    ).join('');
    for (const b of $('layers').querySelectorAll('.layer')) {
      b.onclick = () => { s.setMode(b.dataset.m); this.buildLayers(s); };
    }
  },

  say (t) { $('probe').textContent = t; }
};

const canvas = $('stage');
const studio = new Studio(canvas, ui);
const gl = $('stage3d');
const view = new View3D(gl);
view.setStyle(prefs.style);

window.room = { studio, ui, view, walker, prefs, progress, COMMISSIONS };

document.documentElement.style.setProperty('--bg', palette().bg);
document.body.style.background = palette().bg;
document.documentElement.classList.toggle('text-large', prefs.text === 'large');

/* ------------------------------------------------------------------ */
/* Overlay routing                                                     */
/* ------------------------------------------------------------------ */

function show (id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
}
function closeOverlays () {
  for (const o of OVERLAYS) $(o).hidden = true;
}
function setInGame (on) {
  $('viewswitch').hidden = !on;
  $('gamehud').hidden = !on;
  if (!on) {
    for (const id of ['tray', 'layers', 'verdict', 'meters', 'walkbar', 'interrupt3d', 'signoffBtn']) {
      $(id).hidden = true;
    }
    $('stage').hidden = true;
    gl.hidden = true;
    $('grade').hidden = true;
  }
}

/* Painted backdrops --------------------------------------------------- */

function tryBackdrop (imgId, src) {
  const img = $(imgId);
  if (!img) return;
  img.hidden = true;
  img.onload = () => { img.hidden = false; };
  img.onerror = () => { img.hidden = true; };
  img.src = src;
}
tryBackdrop('titleBg', 'assets/title.png');

/* Title ------------------------------------------------------------- */

$('playBtn').onclick = () => { renderBoard(); show('board'); };
$('helpBtn').onclick = () => show('help');
$('aboutBtn').onclick = () => { renderAbout(); show('about'); };
$('settingsBtn').onclick = () => { syncSettings(); show('settings'); };
$('helpBack').onclick = () => show('title');
$('aboutBack').onclick = () => show('title');
$('settingsBack').onclick = () => show('title');
$('boardBack').onclick = () => show('title');

/* Board ------------------------------------------------------------- */

function renderBoard () {
  $('boardList').innerHTML = COMMISSIONS.map(c => {
    const open = isUnlocked(c, progress);
    const stars = progress.done[c.id] ?? 0;
    const who = c.people.map(k => PEOPLE[k].name).join(' · ');
    return `<button class="job${open ? '' : ' locked'}" data-id="${c.id}" ${open ? '' : 'disabled'}>
      <span class="job-title">${c.title}</span>
      <span class="job-who">${open ? who : 'finish the one before'}</span>
      <span class="job-stars">${stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : (open ? 'new' : '')}</span>
    </button>`;
  }).join('');
  for (const b of $('boardList').querySelectorAll('.job:not(.locked)')) {
    b.onclick = () => openBrief(COMMISSIONS.find(c => c.id === b.dataset.id));
  }

  const calm = finishedRooms(progress);
  $('calmHead').hidden = calm.length === 0;
  $('calmNote').hidden = calm.length === 0;
  $('calmList').innerHTML = calm.map(c =>
    `<button class="job calm" data-id="${c.id}">
      <span class="job-title">${c.title}</span>
      <span class="job-who">wander, nothing to do</span>
      <span class="job-stars">↩</span>
    </button>`).join('');
  for (const b of $('calmList').querySelectorAll('.job')) {
    b.onclick = () => {
      commission = COMMISSIONS.find(c => c.id === b.dataset.id);
      studio.load(commission);
      closeOverlays();
      setInGame(true);
      setMode('free');
    };
  }
}

/* Brief ------------------------------------------------------------- */

function openBrief (c) {
  briefTarget = c;
  $('briefOwner').textContent = `a commission from ${c.owner}`;
  $('briefTitle').textContent = c.title;
  $('briefText').textContent = c.brief;
  $('briefPeople').innerHTML = c.people.map(k =>
    `<div class="cast"><b>${PEOPLE[k].name}</b><p>${CAST[k].story}</p>
     <p class="cast-mech">${PEOPLE[k].blurb}</p></div>`
  ).join('');
  $('briefRules').innerHTML = (c.constraints ?? []).length
    ? `<div class="rules"><b>The owner’s rules</b>` +
      c.constraints.map(r => `<p>${r.text}</p>`).join('') + '</div>'
    : '';
  tryBackdrop('briefBg', `assets/room-${c.room}.png`);
  show('brief');
}

$('briefBack').onclick = () => show('board');
$('briefGo').onclick = () => {
  commission = briefTarget;
  studio.load(commission);
  closeOverlays();
  setInGame(true);
  setMode('plan');
};

/* Sign off ----------------------------------------------------------- */

$('signoffBtn').onclick = () => {
  if (!studio.ready()) return;
  const stars = starsFor(studio.results, studio.budgetLeft());
  progress.done[commission.id] = Math.max(progress.done[commission.id] ?? 0, stars);
  saveProgress(progress);

  $('debriefTitle').textContent = commission.title;
  $('debriefStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('debriefGrid').innerHTML = studio.results.map(r => {
    const cells = [
      ['worst moment', `${Math.round(r.worst.load * 100)}%`],
      ['reserve left', `${Math.round(r.reserve)}%`],
      ['interruptions', String(r.events.length)],
      ['recovered', String(r.events.filter(e => e.recoverable).length)]
    ];
    if (r.maskedSeconds > 2) cells.push(['holding it together', `${Math.round(r.maskedSeconds)}s`]);
    return `<div class="debrief-person"><dt>${r.person.name}</dt>` +
      cells.map(([k, v]) => `<dd><i>${k}</i><b>${v}</b></dd>`).join('') + '</div>';
  }).join('');
  $('debriefNote').textContent = debriefNote();

  const next = nextCommission();
  $('debriefNext').textContent = next ? 'Next commission' : 'Finish';
  setInGame(false);
  show('debrief');
};

function debriefNote () {
  const rs = studio.results;
  const masked = rs.reduce((n, r) => n + r.maskedSeconds, 0);
  const rescued = rs.some(r => r.events.length && r.events.every(e => e.recoverable));
  if (rescued) {
    return 'They were still interrupted — the world does not stop — but every ' +
      'time, there was somewhere to settle after. That is what you actually built.';
  }
  if (masked > 6) {
    return 'It works, and part of what made it work was them holding themselves ' +
      'together through the crowded stretch. The room is better. It is not yet kind.';
  }
  return 'Nobody was asked to cope, push through, or be less sensitive. The room ' +
    'moved instead. That is the whole trick, and it was always available.';
}

function nextCommission () {
  const i = COMMISSIONS.indexOf(commission);
  return COMMISSIONS[i + 1] ?? null;
}

$('debriefNext').onclick = () => {
  const next = nextCommission();
  if (next) { openBrief(next); return; }
  const total = Object.values(progress.done).reduce((a, b) => a + b, 0);
  $('endingStars').textContent =
    `${total} star${total === 1 ? '' : 's'} across ${Object.keys(progress.done).length} commissions.`;
  show('ending');
};
$('debriefBoard').onclick = () => { renderBoard(); show('board'); };
$('endingBoard').onclick = () => { renderBoard(); show('board'); };
$('exitBtn').onclick = () => { setInGame(false); renderBoard(); show('board'); };

/* About -------------------------------------------------------------- */

function renderAbout () {
  $('aboutSources').innerHTML = SOURCES.map(s =>
    `<div class="source"><b>${s.what}</b><i>${s.who}</i><p>${s.note}</p></div>`
  ).join('');
}

/* Settings ----------------------------------------------------------- */

const SETTING_GROUPS = [
  ['styleChoices', v => { prefs.style = v; view.setStyle(v); }, () => prefs.style],
  ['motionChoices', v => { prefs.motion = v; }, () => prefs.motion],
  ['textChoices', v => {
    prefs.text = v;
    document.documentElement.classList.toggle('text-large', v === 'large');
  }, () => prefs.text]
];
for (const [id, set] of SETTING_GROUPS) {
  for (const b of $(id).querySelectorAll('.choice')) {
    b.setAttribute('role', 'radio');
    b.onclick = () => { set(b.dataset.v); savePrefs(); syncSettings(); };
  }
}
function syncSettings () {
  for (const [id, , get] of SETTING_GROUPS) {
    for (const b of $(id).querySelectorAll('.choice')) {
      b.setAttribute('aria-checked', String(b.dataset.v === get()));
    }
  }
}

/* ------------------------------------------------------------------ */
/* In-game views                                                       */
/* ------------------------------------------------------------------ */

function rebuild3d () {
  view.build(studio.room, buildHeat(studio.grid, studio.mode));
}

function setMode (m) {
  mode = m;
  $('stage').hidden = m !== 'plan';
  gl.hidden = m === 'plan';
  $('grade').hidden = m === 'plan';
  $('freehud').hidden = m !== 'free';
  $('hintBtn').hidden = m !== 'plan';
  $('hintCard').hidden = true;
  $('walkbar').hidden = m !== 'walk';
  $('meters').hidden = m !== 'walk';
  $('tray').hidden = m !== 'plan';
  $('layers').hidden = m !== 'look';
  $('verdict').hidden = m === 'walk' || m === 'free';
  $('probe').style.display = m === 'plan' ? '' : 'none';
  $('signoffBtn').hidden = !(m === 'plan' && studio.ready());
  $('interrupt3d').hidden = true;
  for (const [id, key] of [['viewPlan', 'plan'], ['viewRoom', 'look'],
                           ['viewWalk', 'walk'], ['viewFree', 'free']]) {
    $(id).classList.toggle('on', key === m);
  }
  if (m !== 'plan') { rebuild3d(); walkT = 0; }
  if (m === 'free') {
    // Start at the door facing the counter, the way anyone entering would.
    const d = studio.room.door, g2 = studio.room.goal;
    const len = Math.hypot(g2.x - d.x, g2.y - d.y) || 1;
    walker.reset({
      x: d.x + (g2.x - d.x) / len * 120,
      y: d.y + (g2.y - d.y) / len * 120
    });
    walker.faceFrom(d, g2);
  }
}
window.room.setMode = setMode;

$('viewPlan').onclick = () => setMode('plan');
$('viewRoom').onclick = () => setMode('look');
$('viewWalk').onclick = () => setMode('walk');
$('viewFree').onclick = () => setMode('free');

const origRecompute = studio.recompute.bind(studio);
studio.recompute = function () {
  origRecompute();
  if (mode !== 'plan' && view.room) {
    view.sync(studio.room);
    view.refreshLights();
  }
};

/* Pointer ------------------------------------------------------------ */

const local = e => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  const p = local(e);
  studio.onDown(p.x, p.y);
});
canvas.addEventListener('pointermove', e => {
  const p = local(e);
  studio.onMove(p.x, p.y);
  const reading = studio.probeReading();
  if (!studio.trayPick) ui.say(reading ? reading.join('   ·   ') : '');
});
canvas.addEventListener('pointerup', () => studio.onUp());
canvas.addEventListener('pointercancel', () => studio.onUp());
window.addEventListener('keydown', e => {
  if ((e.key === 'Backspace' || e.key === 'Delete') && commission) {
    e.preventDefault();
    studio.removeHeld();
  }
});
gl.addEventListener('pointermove', e => {
  if (!e.buttons) return;
  if (mode === 'look') orbit -= e.movementX * 0.005;
  else if (mode === 'free') walker.lookBy(e.movementX);
});

const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', e => {
  if (mode !== 'free' || !WALK_KEYS.has(e.code)) return;
  e.preventDefault();
  walker.down(e.code);
});
window.addEventListener('keyup', e => walker.up(e.code));
window.addEventListener('blur', () => walker.keys.clear());

/* Hint ---------------------------------------------------------------- */

let pendingHint = null;

$('hintBtn').onclick = () => {
  $('hintText').textContent = 'Looking…';
  $('hintCard').hidden = false;
  $('hintDo').hidden = true;
  // Next frame, so the card paints before the search blocks the thread.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const ev = evaluate(studio.room, studio.constraints, studio.people);
    if (ev.ok) {
      $('hintText').textContent =
        'Nothing needs fixing. Everyone gets through and the owner is happy — ' +
        'sign it off.';
      pendingHint = null;
      return;
    }
    // Capped so a stuck player waits a moment, not a minute.
    const hint = bestMove(studio.room, studio.constraints, studio.people, ev, 60);
    if (!hint) {
      $('hintText').textContent =
        'No single change helps from here, which usually means something ' +
        'bought is in the wrong place. Try removing one thing (select it and ' +
        'press Delete) and see what that frees up.';
      pendingHint = null;
      return;
    }
    pendingHint = hint.cand;
    const who = hint.failing.person.name;
    const cause = READABLE[hint.blame] ?? hint.blame;
    $('hintText').textContent =
      `${who} is stopped by ${cause}. The biggest single improvement from ` +
      `here is to ${hint.cand.label}.`;
    $('hintDo').hidden = false;
  }));
};

$('hintClose').onclick = () => { $('hintCard').hidden = true; };
$('hintDo').onclick = () => {
  if (pendingHint) applyMove(studio.room, pendingHint);
  pendingHint = null;
  $('hintCard').hidden = true;
  studio.recompute();
  ui.syncTray(studio);
};

/* Meters ------------------------------------------------------------- */

function updateMeters (step) {
  if (!step) return;
  const p = studio.person;
  $('mName').textContent = p.name;
  $('mReserve').style.width = `${Math.max(0, step.reserve / p.reserve * 100)}%`;
  $('mAbsorb').style.width = `${step.absorption * 100}%`;
  $('mMask').hidden = !step.masked;
}

/* Frame loop --------------------------------------------------------- */

let last = performance.now();

function frame (now) {
  const dt = Math.min(64, now - last);
  last = now;
  try {
    if (!commission) { /* menus only */ }
    else if (mode === 'plan') {
      studio.render();
    } else {
      const path = studio.result?.path ?? [];
      if (mode === 'look') {
        view.setCutaway(true);
        view.setFloorSurvey(true);
        view.setPlanCamera(orbit, 0.86, 1.9);
        if (prefs.motion === 'on') {
          walkT = (walkT + dt / Math.max(4000, path.length * 60)) % 1;
        }
        const i = Math.min(path.length - 1, Math.floor(walkT * path.length));
        view.placeVisitor(path[i], path[Math.min(path.length - 1, i + 4)]);
        updateMeters(path[i]);
      } else if (mode === 'free') {
        view.setCutaway(false);
        view.setFloorSurvey(false);
        view.placeVisitor(null);
        walker.update(dt, studio.room, studio.grid);
        view.setFreeCamera(walker.pos, walker.yaw);

        // What it is like to stand exactly here, in this person's terms.
        const i = studio.grid.at(walker.x, walker.y);
        const load = studio.grid.load[i];
        const g = $('grade');
        g.classList.toggle('load1', load >= 0.26 && load < 0.42);
        g.classList.toggle('load2', load >= 0.42);
        const top = studio.probeAt(walker.x, walker.y);
        $('freeRead').textContent = load < 0.16
          ? 'quiet here'
          : (top ? `${READABLE[top.domain] ?? top.domain}, ${Math.round(top.raw * 100)}%` : '');
      } else {
        view.setCutaway(false);
        view.setFloorSurvey(false);
        view.placeVisitor(null);
        walkT = Math.min(1, walkT + dt / Math.max(2600, path.length * 46));
        view.setWalkCamera(path, walkT);
        $('walkFill').style.width = `${walkT * 100}%`;
        $('walkbar').classList.toggle('bad', !studio.result?.ok);
        const idx = Math.floor(walkT * path.length);
        updateMeters(path[Math.min(path.length - 1, idx)]);
        const ev = (studio.result?.events ?? []).filter(e => e.index <= idx).slice(-1)[0];
        const fresh = ev && idx - ev.index < 26;
        $('interrupt3d').hidden = !fresh;
        if (fresh) {
          $('interrupt3dText').textContent = ev.text;
          $('interrupt3dNote').textContent = ev.recoverable
            ? 'There was somewhere to settle afterwards.'
            : 'Nowhere to settle afterwards. Absorption starts again from nothing.';
        }
        $('walkNote').textContent = walkT >= 1
          ? (studio.verdict()?.headline ?? '')
          : `walking the route ${studio.person.name} actually took`;
      }
      view.render();
    }
  } catch (err) {
    console.error('[room] frame failed, loop continuing:', err);
    window.room.lastError = err;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Boot --------------------------------------------------------------- */

setInGame(false);
show('title');
