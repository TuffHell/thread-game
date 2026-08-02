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
  COMMISSIONS, CAST, GAME, FRAME, INTERLUDES, CODA, AFTERWORD, loadProgress,
  saveProgress, isUnlocked, starsFor, finishedRooms
} from './campaign.js';
import { PEOPLE } from './person.js';
import { palette, settings } from './config.js';
import { buildHeat } from './plan.js';
import { View3D } from './view3d.js';
import { Walker } from './walker.js';
import { shiftFor, STEP_LABEL } from './shifts/index.js';
import { MODEL as SVC } from './service.js';
import * as sound from './sound.js';
import { evaluate, bestMove, applyMove } from './solver.js';
import { SOURCES } from './fragments.js';
import * as overload from './overload.js';

const $ = id => document.getElementById(id);

/**
 * Write to the DOM only when the value actually changed.
 *
 * The service and walk loops update the same handful of readouts sixty times
 * a second, and most frames nothing has moved. Assigning textContent or
 * innerHTML regardless invalidates layout every time; these skip the write
 * when it would be a no-op, which is nearly always.
 */
const _last = new Map();
function changed (key, val) {
  if (_last.get(key) === val) return false;
  _last.set(key, val);
  return true;
}
const setText = (id, v) => { if (changed(id + '.t', v)) $(id).textContent = v; };
const setHTML = (id, v) => { if (changed(id + '.h', v)) $(id).innerHTML = v; };
const setW = (id, v) => { if (changed(id + '.w', v)) $(id).style.width = v; };
const setH = (id, v) => { if (changed(id + '.y', v)) $(id).style.height = v; };

const LAYER_LABEL = {
  load: 'everything', sound: 'noise', light: 'brightness', flicker: 'flicker',
  glare: 'glare', crowd: 'people', clutter: 'clutter', smell: 'smell',
  escape: 'retreat', exposure: 'wayfinding'
};

const OVERLAYS = ['title', 'warn', 'opening', 'board', 'brief', 'debrief',
                  'ending', 'svcDone', 'help', 'about', 'settings'];

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
  try { return { style: 'pixel', motion: 'on', text: 'normal', sound: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; }
  catch { return { style: 'pixel', motion: 'on', text: 'normal', sound: false }; }
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
let service = null;
let activeShift = null;

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

// css/room.css owns this game's palette. Stamping THREAD's cold blue onto
// the body from JS overrode it and left every menu looking like the wrong
// game, so the room warm dark wins unless a high-contrast mode is chosen.
const ROOM_BG = '#191016';
const bg = settings.palette === 'deep' ? ROOM_BG : palette().bg;
document.documentElement.style.setProperty('--bg', bg);
document.body.style.background = bg;
document.documentElement.classList.toggle('text-large', prefs.text === 'large');
if (prefs.sound) {
  // Only ever after a gesture; browsers block audio before one anyway.
  window.addEventListener('pointerdown', function once () {
    sound.setOn(true);
    $('soundBtn').textContent = 'sound on';
    window.removeEventListener('pointerdown', once);
  }, { once: true });
}

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
  // Turns on the scrims that keep the interface readable over a bright room.
  document.body.classList.toggle('ingame', on);
  $('scrim').hidden = !on;
  $('viewswitch').hidden = !on;
  $('gamehud').hidden = !on;
  if (!on) {
    for (const id of ['tray', 'layers', 'verdict', 'meters', 'walkbar',
                      'interrupt3d', 'signoffBtn', 'svcTray', 'svcSay']) {
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

/* The cold open ------------------------------------------------------ */

/*
 * Fifteen seconds of walking into a café that does not work, before any
 * menu, any explanation and any request for sympathy.
 *
 * The subject of this game was previously something you discovered on the
 * About page. That is backwards: the strongest thing here is that the room's
 * cost to a specific person is simulated rather than asserted, and the way
 * to make somebody believe that is to let them watch it happen and then show
 * them the numbers it came from. Nothing in here is scripted — it replays
 * the exact path the simulation produced, and stops where it stopped.
 */
let opening = false;
let lastKnock = -1;

function startOpening () {
  opening = true;
  lastKnock = -1;
  overload.reset();
  commission = COMMISSIONS[0];
  studio.load(commission);
  closeOverlays();
  setInGame(true);
  walkT = 0;
  setMode('walk');
}

function endOpening () {
  const r = studio.result;
  const worstDomain = r?.blame ? READABLE[r.blame.domain] ?? r.blame.domain : 'the room';
  $('openingHead').textContent = r?.ok
    ? 'Mara got through — this time.'
    : `Mara stopped ${r?.leg ?? 'on the way in'}.`;
  $('openingBody').textContent =
    'That walk was not animation. Every step was scored against nine sensory ' +
    'fields computed from where the furniture actually is, combined by their ' +
    'worst channel rather than their average — because attention that runs ' +
    'deep is dominated by the loudest thing in the room, and a nice rug does ' +
    'not cancel a grinder. She has come here every Tuesday for two years.';
  $('openingFacts').innerHTML = [
    ['what stopped her', worstDomain],
    ['worst moment', `${Math.round((r?.worst?.load ?? 0) * 100)}% of what she can take`],
    ['interruptions', String(r?.events?.length ?? 0)],
    ['asked to cope', 'never — you move the furniture instead']
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  overload.reset();
  setInGame(false);
  show('opening');
}

// The intensity of the felt overload, remembered between sessions and
// pinned to gentle if the system has asked for less motion.
prefs.overload = prefs.overload ?? overload.respectSystem();
overload.attach($('app') ?? document.getElementById('app'), $('grade'));
overload.setLevel(prefs.overload);

$('openingBtn').onclick = () => show('warn');
$('warnBack').onclick = () => show('title');
$('warnGo').onclick = () => {
  prefs.overload = 'full'; savePrefs(); overload.setLevel('full'); startOpening();
};
$('warnSoft').onclick = () => {
  prefs.overload = 'gentle'; savePrefs(); overload.setLevel('gentle'); startOpening();
};
$('openingBack').onclick = () => { opening = false; show('title'); };
$('openingFix').onclick = () => {
  opening = false;
  openBrief(COMMISSIONS[0]);
};

/* Board ------------------------------------------------------------- */

function renderBoard () {
  // The job description, once, for someone who has not taken a job yet.
  const started = Object.keys(progress.done).length > 0;
  paragraphs('boardFrame', started ? null : FRAME);

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

/**
 * Fill an element with a passage, one paragraph per blank line, and hide it
 * when there is nothing to say. The interludes and the coda are the only
 * long-form writing in the game and they read badly as one block.
 */
function paragraphs (id, text) {
  const el = $(id);
  if (!el) return;
  if (!text) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = text.split('\n\n')
    .map(t => `<p>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
    .join('');
}

/* Brief ------------------------------------------------------------- */

function openBrief (c) {
  briefTarget = c;
  $('briefOwner').textContent = `a commission from ${c.owner}`;
  $('briefTitle').textContent = c.title;
  // The epigraph names the idea, the brief gives the situation, the stake
  // says what is actually being argued. Three beats, in that order, so the
  // room you are about to walk into means something before you see it.
  $('briefEpigraph').textContent = c.epigraph ?? '';
  $('briefEpigraph').hidden = !c.epigraph;
  $('briefText').textContent = c.brief;
  $('briefStake').textContent = c.stake ?? '';
  $('briefStake').hidden = !c.stake;
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
  // Each of them says one thing, in their own voice, about the room you
  // just handed back. This is the only place the cast speaks.
  $('debriefAfterword').innerHTML = studio.results.map(r => {
    const key = Object.keys(PEOPLE).find(k => PEOPLE[k] === r.person);
    const line = AFTERWORD[key]?.[commission.room];
    if (!line) return '';
    return `<p class="afterword-line"><b>${r.person.name}</b><span>${line}</span></p>`;
  }).join('');

  $('debriefNote').textContent = debriefNote();
  paragraphs('debriefInterlude', INTERLUDES[commission.id]);

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
  paragraphs('endingCoda', CODA);
  $('endingStars').textContent =
    `${total} star${total === 1 ? '' : 's'} across ${Object.keys(progress.done).length} commissions.`;
  show('ending');
};
$('debriefBoard').onclick = () => { renderBoard(); show('board'); };
$('endingBoard').onclick = () => { renderBoard(); show('board'); };
$('exitBtn').onclick = () => { setInGame(false); renderBoard(); show('board'); };

// The verdict is a one-line bar; the reasoning opens on request so it is
// never sitting on top of the part of the room it is talking about.
$('verdictToggle').onclick = () => {
  const v = $('verdict');
  const open = v.classList.toggle('open');
  $('verdictToggle').setAttribute('aria-expanded', String(open));
  $('verdictToggle').textContent = open ? 'close' : 'why?';
};

$('soundBtn').onclick = () => {
  const isOn = sound.toggle();
  prefs.sound = isOn;
  savePrefs();
  $('soundBtn').textContent = isOn ? 'sound on' : 'sound off';
};

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
  ['overloadChoices', v => { prefs.overload = v; overload.setLevel(v); },
   () => prefs.overload],
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
  if (m !== 'walk') { overload.reset(); lastKnock = -1; }
  mode = m;
  $('stage').hidden = m !== 'plan';
  gl.hidden = m === 'plan';
  $('grade').hidden = m === 'plan';
  $('freehud').hidden = m !== 'free' && m !== 'service';
  $('svc').hidden = m !== 'service';
  $('svcAction').hidden = true;
  $('svcTray').hidden = m !== 'service';
  $('svcSay').hidden = true;
  // Every room has a shift of its own, unlocked by signing that room off.
  $('viewService').hidden = !(commission && shiftFor(commission.room) &&
                              progress.done[commission.id]);
  $('hintBtn').hidden = m !== 'plan';
  $('hintCard').hidden = true;
  $('walkbar').hidden = m !== 'walk';
  $('meters').hidden = m !== 'walk' && m !== 'look';
  $('tray').hidden = m !== 'plan';
  $('layers').hidden = m !== 'look';
  $('verdict').hidden = m !== 'plan' && m !== 'look';
  $('probe').style.display = m === 'plan' ? '' : 'none';
  $('signoffBtn').hidden = !(m === 'plan' && studio.ready());
  $('interrupt3d').hidden = true;
  for (const [id, key] of [['viewPlan', 'plan'], ['viewRoom', 'look'],
                           ['viewWalk', 'walk'], ['viewFree', 'free']]) {
    $(id).classList.toggle('on', key === m);
  }
  if (m !== 'plan') { rebuild3d(); walkT = 0; }
  if (service && m !== 'service') {
    // Leaving mid-shift: take the customers and the cups with you.
    service.clearCustomers();
    service = null;
    window.room.service = null;
    studio.recompute();
  }
  if (m === 'service') {
    const Shift = shiftFor(studio.commission?.room ?? commission.room);
    if (!Shift) { mode = 'plan'; return setMode('plan'); }
    service = new Shift(studio.room);
    activeShift = Shift;
    // Each room's shift argues something different, so say which one this is.
    showSay(`${Shift.title} — ${Shift.keyHint}`);
    window.room.service = service;
    // Customers are added to room.things by the Service, which happens after
    // the scene was built — so they existed in the simulation and were
    // invisible in the world. Push them into the scene and refresh the field
    // so their noise counts from the first frame.
    studio.recompute();
    view.sync(studio.room);
    view.refreshLights();
  }
  if (m === 'free' || m === 'service') {
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
$('viewService').onclick = () => setMode('service');

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
  if (mode !== 'free' && mode !== 'service') return;
  if (e.code === 'KeyE' && mode === 'service' && service) {
    e.preventDefault();
    // Work first; if there is nothing to do here, talk to whoever is here.
    if (!service.begin(walker.x, walker.y)) {
      const said = service.talk(walker.x, walker.y);
      if (said) showSay(said.text);
    }
    return;
  }
  if (!WALK_KEYS.has(e.code)) return;
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

/* The Quiet Service --------------------------------------------------- */

/**
 * One tick of whichever shift is running.
 *
 * Deliberately knows nothing about which one. Each shift reports what it
 * wants shown through hud(), so adding a fifth room means writing a fifth
 * shift and not touching this function at all.
 */
function tickService (dt) {
  if (!service) return;
  const wasFlow = service.flow ?? 0;
  const done = service.update(dt, walker.x, walker.y);

  if (done) {
    // Sound, per action, where the shift has one that fits.
    if (done.completed && done.step === 'serve') sound.sfx.serve(service.flow ?? 0.5);
    else if (done.step === 'grind') sound.sfx.grind();
    else if (done.step === 'pull') sound.sfx.pull();
    else if (done.step === 'steam') sound.sfx.steam();
    else if (done.step === 'clear') sound.sfx.serve((service.flow ?? 0.5) * 0.4);
    else if (done.step === 'tannoy') sound.sfx.grind();
    else if (done.step === 'board' || done.step === 'person') sound.sfx.pull();
    else if (done.step) sound.sfx.steam();

    // An interruption you caused reads as one: a knock, not a chime.
    if (done.broke) { sound.sfx.grind(); overload.knock(); }
    if ((service.flow ?? 0) > wasFlow) sound.sfx.flowUp(service.flow);
    if (done.said) showSay(done.said);
    // Anything that adds or removes a body or an object changes the field.
    if (done.completed || done.cleared || done.handled) {
      studio.recompute();
      view.sync(studio.room);
    }
  }

  // The room tone follows how loud it is where you are standing.
  sound.setLoad(studio.grid.load[studio.grid.at(walker.x, walker.y)] ?? 0);

  const h = service.hud();

  setHTML('svcOrders', h.rows.length
    ? h.rows.map(r =>
        `<div class="svc-order${r.ready ? ' ready' : ''}${r.warn ? ' warn' : ''}">` +
        `<b>${r.label}</b><span class="steps">${r.marks ?? ''}</span></div>`).join('')
    : `<div class="svc-order"><b>${h.empty}</b></div>`);

  setText('svcFlowLabel', h.meter.label);
  setW('svcFlow', `${Math.round(Math.max(0, Math.min(1, h.meter.value)) * 100)}%`);
  setText('svcFlowNote', h.note);

  // Only the café puts things in your hands.
  $('svcTray').hidden = h.tray == null;
  if (h.tray != null) {
    setHTML('svcTraySlots', Array.from({ length: SVC.trayCapacity }, (_, i) =>
      `<div class="carry-slot${i < h.tray ? ' full' : ''}">${
        i < h.tray ? '\u2615' : ''}</div>`).join(''));
  }

  const w = service.working;
  if (w) {
    $('svcAction').hidden = false;
    setH('svcRing', `${Math.round(Math.min(100, w.t / w.need * 100))}%`);
    setText('svcActionText', w.label ?? STEP_LABEL[w.step] ?? 'working');
  } else {
    const near = service.atHand(walker.x, walker.y);
    if (near) {
      $('svcAction').hidden = false;
      setH('svcRing', '0%');
      setText('svcActionText', `${near.label ?? STEP_LABEL[near.step] ?? 'work'} — press E`);
    } else {
      const who = service.talkTarget?.(walker.x, walker.y);
      $('svcAction').hidden = !who;
      if (who) {
        setH('svcRing', '0%');
        setText('svcActionText', 'Say hello — press E');
      }
    }
  }

  setText('freeRead', service.finished ? '' : h.count);

  if (service.finished) showServiceReport();
}

/**
 * A line of speech, for a moment.
 *
 * Long enough to read, short enough that it never becomes something you are
 * waiting on. Nothing in this mode is allowed to make you wait.
 */
let sayTimer = null;
function showSay (text) {
  setText('svcSayText', text);
  $('svcSay').hidden = false;
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { $('svcSay').hidden = true; }, 2600);
}

function showServiceReport () {
  sound.sfx.done();
  const r = service.report();
  service.clearCustomers();
  studio.recompute();
  service = null;
  window.room.service = null;
  $('svcTray').hidden = true;
  $('svcSay').hidden = true;
  $('svcDoneTitle').textContent = r.headline;
  $('svcGrid').innerHTML = r.grid.map(([k, v, u]) =>
    `<div><dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`).join('');
  $('svcNote').textContent = r.note;
  $('svcEvidence').textContent = r.evidence;
  setInGame(false);
  show('svcDone');
}

$('svcAgain').onclick = () => { closeOverlays(); setInGame(true); setMode('service'); };
$('svcBoard').onclick = () => { setInGame(false); renderBoard(); show('board'); };

/* Meters ------------------------------------------------------------- */

function updateMeters (step) {
  if (!step) return;
  const p = studio.person;
  setText('mName', p.name);
  setW('mReserve', `${Math.round(Math.max(0, step.reserve / p.reserve * 100))}%`);
  setW('mAbsorb', `${Math.round(step.absorption * 100)}%`);
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
      } else if (mode === 'service') {
        view.setCutaway(false);
        view.setFloorSurvey(false);
        view.placeVisitor(null);
        walker.update(dt, studio.room, studio.grid);
        view.setFreeCamera(walker.pos, walker.yaw);
        // Only the café puts drinks in your hands or orders over heads; the
        // other three shifts have neither, and asking them for a tray they
        // do not have was killing the frame loop.
        view.setCarry(service?.tray?.length ?? 0);
        view.setOrderBubbles(service?.orders ?? []);
        tickService(dt);
      } else if (mode === 'free') {
        view.setCutaway(false);
        view.setFloorSurvey(false);
        view.placeVisitor(null);
        view.setCarry(0);
        view.setOrderBubbles([]);
        walker.update(dt, studio.room, studio.grid);
        view.setFreeCamera(walker.pos, walker.yaw);

        // What it is like to stand exactly here, in this person's terms.
        const i = studio.grid.at(walker.x, walker.y);
        const load = studio.grid.load[i];
        const g = $('grade');
        g.classList.toggle('load1', load >= 0.26 && load < 0.42);
        g.classList.toggle('load2', load >= 0.42);
        const top = studio.probeAt(walker.x, walker.y);
        setText('freeRead', load < 0.16
          ? 'quiet here'
          : (top ? `${READABLE[top.domain] ?? top.domain}, ${Math.round(top.raw * 100)}%` : ''));
      } else {
        view.setCutaway(false);
        view.setFloorSurvey(false);
        view.placeVisitor(null);
        // Slower for the cold open: it is the first thing anyone sees and it
        // is meant to be watched, not skipped past.
        const pace = opening ? Math.max(11000, path.length * 130)
                             : Math.max(2600, path.length * 46);
        walkT = Math.min(1, walkT + dt / pace);
        view.setWalkCamera(path, walkT);
        setW('walkFill', `${Math.round(walkT * 100)}%`);
        $('walkbar').classList.toggle('bad', !studio.result?.ok);
        const idx = Math.floor(walkT * path.length);
        const step = path[Math.min(path.length - 1, idx)];
        updateMeters(step);
        // The picture and the sound follow what the room is costing her.
        if (step) {
          overload.apply(dt, step.load ?? 0,
                         Math.max(0, (step.reserve ?? 0) / studio.person.reserve));
          sound.setLoad(step.load ?? 0);
        }
        const ev = (studio.result?.events ?? []).filter(e => e.index <= idx).slice(-1)[0];
        const fresh = ev && idx - ev.index < 26;
        if (fresh && lastKnock !== ev.index) { lastKnock = ev.index; overload.knock(); }
        $('interrupt3d').hidden = !fresh;
        if (fresh) {
          setText('interrupt3dText', ev.text);
          setText('interrupt3dNote', ev.recoverable
            ? 'There was somewhere to settle afterwards.'
            : 'Nowhere to settle afterwards. Absorption starts again from nothing.');
        }
        setText('walkNote', walkT >= 1
          ? (studio.verdict()?.headline ?? '')
          : `walking the route ${studio.person.name} actually took`);
        // The cold open ends where the walk ends, and hands over the job.
        if (opening && walkT >= 1) { opening = false; endOpening(); }
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
