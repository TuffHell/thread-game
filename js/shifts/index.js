/**
 * The shifts.
 *
 * One playable mode per room, and each one argues a different thing, because
 * "autism" is not one problem with one accommodation and a game that shipped
 * four reskins of the same café would be saying that it is.
 *
 *   CAFÉ     The Quiet Service   Deep attention is the efficient strategy.
 *   LIBRARY  The Quiet Hour      You are somebody else's interruption.
 *   CLINIC   The List            The accommodation is information.
 *   HALL     The Coffee Morning  Access is maintenance, not a fitting.
 *
 * They share an interface so the interface layer does not need to know which
 * one is running: begin, update, atHand, talk, hud, report, finished. The
 * café predates the interface and is adapted rather than rewritten, because
 * its evidence tests are the strongest thing in the project and were not
 * worth disturbing.
 */

import { Service, STEP_LABEL } from '../service.js';
import { LibraryShift } from './library.js';
import { ClinicShift } from './clinic.js';
import { HallShift } from './hall.js';

/** The café, wearing the same interface as the other three. */
class CafeShift extends Service {
  static roomKind = 'cafe';
  static title = 'The Quiet Service';
  static brief =
    'A Tuesday morning in the café you fixed. Grind, pull, steam — then ' +
    'carry the tray out, hand them over, and collect the cups. Nothing ' +
    'expires, nobody is angry, and there is no way to fail. Do the same ' +
    'thing several times in a row and watch what happens to the clock.';
  static keyHint = 'E to work · E next to somebody to say hello';

  hud () {
    return {
      rows: this.orders.slice(0, 6).map(o => ({
        label: o.name,
        marks: o.needs.map((n, i) => i < o.done ? '●' : '○').join(''),
        ready: o.ready
      })),
      empty: this.messes.length
        ? `clear ${this.messes.length} cup${this.messes.length === 1 ? '' : 's'}`
        : 'all served',
      meter: { label: 'flow', value: this.flow },
      note: this.flow > 0.6 ? 'deep in it — actions are quick'
        : (this.flow > 0.2 ? 'building' : 'do the same thing twice to build it'),
      count: this.finished ? ''
        : (this.served >= this.target
          ? `${this.messes.length} cup${this.messes.length === 1 ? '' : 's'} still out`
          : `${this.served} of ${this.target} served` +
            (this.messes.length ? ` · ${this.messes.length} to clear` : '')),
      tray: this.tray.length
    };
  }

  report () {
    const r = super.report();
    return {
      ...r,
      grid: [
        ['served', r.served, ''],
        ['cups cleared', r.cleared, ''],
        ['time', r.seconds, 'sec'],
        ['per action', r.perAction, 'sec'],
        ['task switches', r.switches, '']
      ],
      headline: r.switches <= Math.max(2, r.actions * 0.25)
        ? 'Eight served, nobody hurried.'
        : 'Eight served — the long way round.',
      evidence:
        'Measured, not asserted, and rerun every time the code changes: a ' +
        'simulated barista who fills the tray, walks it out and collects the ' +
        'cups in runs finishes this morning in 66 seconds. One who makes ' +
        'each coffee and delivers it before starting the next takes 89, and ' +
        'spends the shift at a tenth of the flow. Exiling the grinder to a ' +
        'far corner to protect Mara costs the batching barista under ten per ' +
        'cent. The layout that is kinder to her is nearly free to work in — ' +
        'if you are allowed to stay on one thing.'
    };
  }
}

export const SHIFTS = {
  cafe: CafeShift,
  library: LibraryShift,
  clinic: ClinicShift,
  hall: HallShift
};

export function shiftFor (roomKind) {
  return SHIFTS[roomKind] ?? null;
}

export { STEP_LABEL };
