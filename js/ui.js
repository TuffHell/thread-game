/**
 * The interface layer.
 *
 * Everything the player is told lives here, including the reflection at the
 * end of a level, which deliberately has no score on it. It reports what
 * happened and stops. Ranking someone on how well they resisted being
 * interrupted would be a strange thing to do.
 */

import { settings, PALETTES, palette } from './config.js';
import * as audio from './audio.js';
import { LEVELS } from './levels.js';
import { SOURCES, VOICES } from './fragments.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor () {
    this.el = {
      hud: $('hud'), title: $('title'), calib: $('calibration'),
      reflect: $('reflection'), drawer: $('drawer'), live: $('live'),
      levelCount: $('levelCount'), levelTitle: $('levelTitle'), levelLine: $('levelLine'),
      ladder: $('ladder'), pips: $('pips'), log: $('log'),
      interrupt: $('interrupt'), interruptText: $('interruptText'),
      interruptRing: $('interruptRing'), refuseBtn: $('refuseBtn'),
      answerBtn: $('answerBtn'), interruptNote: $('interruptNote')
    };
    this.logTimers = [];
    this.applyTheme();
    this.buildCalibration();
  }

  bind (game) {
    this.game = game;

    $('beginBtn').onclick = () => { this.hideAll(); game.loadLevel(0); audio.unlock(); };
    $('calibrateBtn').onclick = () => { this.el.title.hidden = true; this.el.calib.hidden = false; };
    $('calibDone').onclick = () => { this.hideAll(); game.loadLevel(0); audio.unlock(); };

    $('settingsBtn').onclick = () => this.openDrawer();
    $('drawerClose').onclick = () => { this.el.drawer.hidden = true; };
    $('skipBtn').onclick = () => this.nextLevel();

    $('teachSkip').onclick = () => game.teacher.stop();
    $('aboutBtn').onclick = () => this.openAbout();
    $('aboutClose').onclick = () => { $('about').hidden = true; };

    $('maskBtn').onclick = () => game.toggleMask();
    const stim = $('stimBtn');
    stim.addEventListener('pointerdown', e => { e.preventDefault(); game.setStim(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      stim.addEventListener(ev, () => game.setStim(false));
    }

    $('nextBtn').onclick = () => this.nextLevel();
    $('replayBtn').onclick = () => { this.el.reflect.hidden = true; game.loadLevel(game.levelIndex); };

    this.el.answerBtn.onclick = () => {
      game.interrupts.resolve('answer');
      game.surface('answered');
    };
    this.el.refuseBtn.onclick = () => {
      game.interrupts.resolve('refuse');
      this.say('You held it. It will come back sooner.', 'note');
    };
  }

  nextLevel () {
    this.el.reflect.hidden = true;
    const n = this.game.levelIndex + 1;
    if (n < LEVELS.length) this.game.loadLevel(n);
    else this.showEnding();
  }

  hideAll () {
    this.el.title.hidden = true;
    this.el.calib.hidden = true;
    this.el.reflect.hidden = true;
    this.el.hud.hidden = false;
  }

  /* -------------------------------------------------------------- */

  applyTheme () {
    const p = palette();
    const r = document.documentElement.style;
    r.setProperty('--bg', p.bg);
    r.setProperty('--bg-glow', p.bgGlow);
    r.setProperty('--ink', p.ink);
    r.setProperty('--ink-soft', p.inkSoft);
    r.setProperty('--surface', p.surface);
    r.setProperty('--edge', p.edge);
    r.setProperty('--accent', settings.palette === 'quiet' ? '#3f7d6d' : '#7fd4c1');
    document.body.style.background = p.bg;
  }

  buildCalibration () {
    const pc = $('paletteChoices');
    pc.setAttribute('role', 'radiogroup');
    pc.innerHTML = Object.entries(PALETTES).map(([k, v]) =>
      `<button class="choice" data-v="${k}"><b>${v.name}</b><span>${v.note}</span></button>`
    ).join('');

    const groups = [
      ['paletteChoices', v => { settings.palette = v; this.applyTheme(); }, () => settings.palette],
      ['motionChoices', v => { settings.motion = +v; }, () => String(settings.motion)],
      ['glowChoices', v => { settings.glow = +v; }, () => String(settings.glow)],
      ['soundChoices', v => { settings.sound = +v; audio.setEnabled(!!+v); }, () => String(settings.sound)],
      ['lensChoices', v => { settings.lens = !!+v; }, () => settings.lens ? '1' : '0'],
      ['interruptChoices', v => {
        settings.interruptions = v;
        if (v === 'off' && this.game) this.game.interrupts.stop();
      }, () => settings.interruptions]
    ];

    this.groups = groups;
    for (const [id, set, get] of groups) {
      const root = $(id);
      if (!root) continue;
      root.querySelectorAll('.choice').forEach(b => {
        b.setAttribute('role', 'radio');
        b.onclick = () => { set(b.dataset.v); this.syncChoices(); };
      });
    }
    this.syncChoices();
  }

  syncChoices () {
    for (const [id, , get] of this.groups) {
      for (const root of [$(id), this.el.drawer.querySelector(`#d-${id}`)]) {
        if (!root) continue;
        root.querySelectorAll('.choice').forEach(b => {
          b.setAttribute('aria-checked', String(b.dataset.v === get()));
        });
      }
    }
  }

  openDrawer () {
    const body = $('drawerBody');
    if (!body.dataset.built) {
      body.innerHTML = this.groups.map(([id]) => {
        const src = $(id);
        const legend = src.closest('.calib-group').querySelector('legend').textContent;
        return `<fieldset class="calib-group"><legend>${legend}</legend>
          <div class="choices" id="d-${id}">${src.innerHTML}</div></fieldset>`;
      }).join('');
      for (const [id, set] of this.groups) {
        body.querySelectorAll(`#d-${id} .choice`).forEach(b => {
          b.onclick = () => { set(b.dataset.v); this.syncChoices(); };
        });
      }
      body.dataset.built = '1';
    }
    this.syncChoices();
    this.el.drawer.hidden = false;
  }

  /* -------------------------------------------------------------- */

  onLevel (game) {
    const d = game.def;
    this.el.levelCount.textContent =
      `weave ${game.levelIndex + 1} of ${LEVELS.length}`;
    this.el.levelTitle.textContent = d.title;
    this.el.levelLine.textContent = d.line;
    this.el.log.innerHTML = '';
    this.syncMeters(game);
    this.say(d.line, 'quiet');
  }

  openAbout () {
    $('aboutSources').innerHTML = SOURCES.map(s =>
      `<div class="source"><b>${s.what}</b><i>${s.who}</i><p>${s.note}</p></div>`
    ).join('');

    // Says plainly whether real voices are in here yet. If they are not, the
    // game does not let written lines stand in for lived accounts.
    $('voicesNote').textContent = VOICES.length
      ? `The lines you find while diving were contributed by autistic people ` +
        `and are used with permission. ${VOICES.length} in total.`
      : 'The lines you find while diving were written for this game. They are ' +
        'not quoted from anyone and they are not testimony. The slot for real ' +
        'statements from autistic people, collected with a charity partner and ' +
        'credited, is built and currently empty.';

    $('about').hidden = false;
    $('aboutClose').focus();
  }

  /**
   * A teaching prompt. Stays put until the thing it asked for happens, so it
   * cannot vanish while someone is still reading it.
   */
  teach (text) {
    const el = $('teach');
    if (!text) { el.hidden = true; return; }
    $('teachText').textContent = text;
    el.hidden = false;
    this.el.live.textContent = text;
  }

  /** A found line. Sits quietly, waits, leaves on its own. */
  fragment (text) {
    const box = $('fragment');
    $('fragmentText').textContent = text;
    box.hidden = false;
    box.classList.remove('out');
    this.el.live.textContent = text;
    clearTimeout(this._fragTimer);
    clearTimeout(this._fragHide);
    this._fragTimer = setTimeout(() => box.classList.add('out'), 6200);
    this._fragHide = setTimeout(() => { box.hidden = true; }, 7400);
  }

  syncMeters (game) {
    const maxDepth = 3;
    $('maskBtn').setAttribute('aria-pressed', String(!!game.masked));
    $('maskBtn').classList.toggle('on', !!game.masked);
    this.el.ladder.innerHTML = Array.from({ length: maxDepth }, (_, i) =>
      `<i class="${i < game.depth ? 'on' : ''}"></i>`).join('');

    // Depth reads as a diver's gauge. Each level in is another twelve metres.
    const m = game.depth * 12;
    $('depthMetres').textContent = m ? `${m}m` : 'surface';

    const full = Math.floor(game.attention);
    const frac = game.attention - full;
    this.el.pips.innerHTML = Array.from({ length: 5 }, (_, i) => {
      if (i < full) return '<i class="on"></i>';
      if (i === full && frac > 0.35) return '<i class="part"></i>';
      return '<i></i>';
    }).join('');
  }

  syncInterrupt (game) {
    const it = game.interrupts;
    const el = this.el.interrupt;

    if (it.state === 'idle') { el.hidden = true; return; }

    el.hidden = false;
    el.classList.toggle('warning', it.state === 'warning');

    if (it.state === 'warning') {
      this.el.interruptRing.style.strokeDashoffset = '119.4';
      return;
    }

    if (this.el.interruptText.textContent !== it.text) {
      this.el.interruptText.textContent = it.text;
    }
    this.el.interruptRing.style.strokeDashoffset = String(119.4 * (1 - it.pressure));
    this.el.refuseBtn.disabled = !it.canRefuse;
    this.el.refuseBtn.textContent = it.canRefuse ? 'Hold it' : 'Not again yet';
  }

  say (text, kind = '') {
    const p = document.createElement('p');
    p.className = kind;
    p.textContent = text;
    this.el.log.appendChild(p);
    this.el.live.textContent = text;

    while (this.el.log.children.length > 4) this.el.log.firstChild.remove();

    setTimeout(() => { p.classList.add('fade'); }, 4200);
    setTimeout(() => { p.remove(); }, 5000);
  }

  /* -------------------------------------------------------------- */

  showReflection (game) {
    const s = game.stats;
    const it = game.interrupts.log;
    const secs = Math.round((performance.now() - s.started) / 1000);
    const wasInterrupted = it.answered + it.forced + it.refused > 0;

    const cells = [
      ['deepest', s.deepest, s.deepest === 1 ? 'level' : 'levels'],
      ['descents', s.descents, ''],
      ['tunes', s.tunes, ''],
      ['time', secs, 'sec']
    ];
    if (wasInterrupted) {
      cells.push(['pulled out', it.answered + it.forced, '']);
      cells.push(['held', it.refused, '']);
      cells.push(['depth lost', it.depthLost, it.depthLost === 1 ? 'level' : 'levels']);
    }
    if (s.affinityTime > 1500) {
      cells.push(['in your own', Math.round(s.affinityTime / 1000), 'sec']);
    }
    if (s.maskedTime > 1500) {
      cells.push(['masked', Math.round(s.maskedTime / 1000), 'sec']);
      cells.push(['it cost', s.maskedCost.toFixed(1), 'attention']);
    }
    if (s.stimTime > 1500) {
      cells.push(['settling', Math.round(s.stimTime / 1000), 'sec']);
    }

    $('reflectGrid').innerHTML = cells.map(([k, v, u]) =>
      `<div><dt>${k}</dt><dd>${v}${u ? `<small>${u}</small>` : ''}</dd></div>`
    ).join('');

    $('reflectTitle').textContent = game.def.title;
    $('reflectNote').textContent = this.reflectionNote(s, it, wasInterrupted);
    this.el.reflect.hidden = false;
    $('nextBtn').focus();
  }

  reflectionNote (s, it, wasInterrupted) {
    // Masking gets read back without a verdict attached. It worked, and it
    // cost, and the player can decide what to make of that.
    if (s.maskedCost >= 2) {
      return `You spent ${s.maskedCost.toFixed(1)} attention on looking fine, ` +
        `before any of it went into the work. It did keep them off you. ` +
        'Both of those are just what happened.';
    }
    if (s.stimTime > 6000) {
      return 'A good part of this was spent on something that did nothing for ' +
        'the puzzle at all, and it is where a fair amount of your capacity ' +
        'came back from.';
    }
    if (wasInterrupted && it.depthLost >= 4) {
      return `You were taken out of it ${it.answered + it.forced} times and had to climb ` +
        `back down ${s.descents} times in total. The work was never the hard part.`;
    }
    if (wasInterrupted && it.refused > it.answered) {
      return 'You held on more often than you gave way. It kept your depth, and it ' +
        'came back for you sooner each time. Both of those are true at once.';
    }
    if (wasInterrupted) {
      return 'Every time you answered, everything you had built went. That is what ' +
        'the cost looks like when you can see it.';
    }
    if (s.affinityTime > 8000) {
      return 'Most of your attention went somewhere the puzzle did not need. It is ' +
        'also where most of your capacity came from.';
    }
    if (s.deepest >= 2) {
      return 'You went down two levels and stayed long enough to change something ' +
        'there. Nothing up on the surface could have told you it was there.';
    }
    return 'Nobody asked anything of you. You worked at your own depth, at your own ' +
      'pace, and it resolved.';
  }

  showEnding () {
    this.el.hud.hidden = true;
    $('reflectEyebrow').textContent = 'the whole weave';
    $('reflectTitle').textContent = 'That is all of it.';
    $('reflectGrid').innerHTML = '';
    $('reflectNote').textContent =
      'Monotropism says autistic attention runs deep and narrow rather than broad ' +
      'and shallow. Everything you just did was built on that: the depth was real, ' +
      'the interruptions cost what they cost, and the strand you were drawn to was ' +
      'the one paying for the rest. Nothing here needed fixing.';
    $('nextBtn').textContent = 'Again from the start';
    $('nextBtn').onclick = () => {
      $('nextBtn').textContent = 'Next';
      this.el.reflect.hidden = true;
      this.el.hud.hidden = false;
      this.game.loadLevel(0);
      $('nextBtn').onclick = () => this.nextLevel();
    };
    $('replayBtn').hidden = true;
    this.el.reflect.hidden = false;
  }
}
