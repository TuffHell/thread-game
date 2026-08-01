/**
 * The campaign.
 *
 * You are an access surveyor. Owners commission you: a room, a budget that is
 * really their goodwill, the people who need the room to work, and the rules
 * they will not bend. Finish a commission and word gets round.
 *
 * The writing rule, same as everywhere else in this project: the characters
 * are fiction, clearly framed as fiction, informed by the sources named on
 * the about page. Nobody here is quoted, nobody is a diagnosis, and nobody
 * is inspirational. They are three people who would like a coffee, a desk
 * and a waiting room, in that order.
 */

export const GAME = {
  title: 'ROOM TO BREATHE',
  strap: 'A game about rooms, and who they are built for.'
};

/** The recurring cast. Mechanical profiles live in person.js. */
export const CAST = {
  mara: {
    story: 'Mara is thirty-four and mixes sound for a living, which people ' +
           'find funny until she explains it: sound she chooses is the whole ' +
           'point. Sound she cannot choose is the grinder. She has come to ' +
           'Franco’s every Tuesday for two years, and some weeks she ' +
           'reaches the door, stands there a moment, and goes home.'
  },
  ollie: {
    story: 'Ollie is nineteen and in his first year of an engineering degree. ' +
           'He revises best in public rooms, close to other people quietly ' +
           'working. He stopped coming to the reading room during exams, ' +
           'which is exactly when he needs it, and he will never, ever say why.'
  },
  jun: {
    story: 'Jun is forty-one and books the first appointment of the day, ' +
           'every time, then sits in the car park until the last possible ' +
           'minute. You can decide a café is not worth it. You cannot ' +
           'decide that about a clinic.'
  }
};

export const COMMISSIONS = [
  {
    id: 'cafe-1',
    room: 'cafe',
    title: 'The Tuesday Café',
    people: ['mara'],
    unlock: null,
    brief:
      'Franco’s café won a small refit grant, and the grant came ' +
      'with an access survey attached. Franco thinks the place is fine. ' +
      'Franco has also noticed that Mara, two years a regular, sometimes ' +
      'reaches the door and does not come in, and he minds about that more ' +
      'than he minds about the survey.',
    owner: 'Franco',
    constraints: []
  },
  {
    id: 'library-1',
    room: 'library',
    title: 'The Reading Room',
    people: ['ollie'],
    unlock: 'cafe-1',
    brief:
      'The librarian keeps a mental register of regulars, the way good ones ' +
      'do. Ollie vanished in exam season. No complaint, no email — he ' +
      'just stopped. The building has a little money for lamps and not much ' +
      'else, and a ceiling full of fluorescent tube.',
    owner: 'the librarian',
    constraints: []
  },
  {
    id: 'cafe-2',
    room: 'cafe',
    title: 'Tuesday, Again',
    people: ['mara', 'jun'],
    unlock: 'library-1',
    budget: 6,
    brief:
      'Word got round, the way it does. Jun started coming on Tuesdays too. ' +
      'Franco is delighted and completely unmovable on two points: the ' +
      'grinder stays within reach of the counter, because workflow, and the ' +
      'menu stays visible from the door, because Franco.',
    owner: 'Franco',
    constraints: [
      { type: 'near', a: 'grinder', b: 'counter', d: 300,
        text: 'Franco’s rule: the grinder stays within reach of the counter.' },
      { type: 'sightline', a: 'door', b: 'menu',
        text: 'Franco’s rule: the menu stays visible from the door.' }
    ]
  },
  {
    id: 'clinic-1',
    room: 'clinic',
    title: 'The Waiting Room',
    people: ['jun'],
    unlock: 'cafe-2',
    brief:
      'Appointments are not optional, which makes this the most important ' +
      'room in the game. The television is bolted to the wall and nobody who ' +
      'works here has ever seen the remote. There is a quiet corner already ' +
      '— wedged behind the reception queue, where it helps no one. The ' +
      'chairs, at least, can move.',
    owner: 'the practice manager',
    constraints: [
      { type: 'sightline', a: 'door', b: 'menu',
        text: 'Practice rule: the check-in board stays visible from the door.' }
    ]
  },
  {
    id: 'hall-1',
    room: 'hall',
    title: 'The Community Hall',
    people: ['mara', 'ollie'],
    unlock: 'clinic-1',
    brief:
      'A coffee morning that calls itself relaxed, in a hall with the ' +
      'acoustics of a swimming pool. Mara and Ollie both said they might ' +
      'come, which between them covers noise, flicker and glare — the ' +
      'full set. The committee asks only that people can find the notices.',
    owner: 'the committee',
    constraints: [
      { type: 'sightline', a: 'door', b: 'menu',
        text: 'Committee rule: the noticeboard stays visible from the door.' }
    ]
  },
  {
    id: 'hall-2',
    room: 'hall',
    title: 'Open Morning',
    people: ['mara', 'ollie', 'jun'],
    unlock: 'hall-1',
    budget: 5,
    brief:
      'All three of them, one morning, one room. Mara’s problem is not ' +
      'Ollie’s and Ollie’s is not Jun’s, and a room that ' +
      'averages its way to “fine” will fail each of them somewhere ' +
      'different. Less to spend this time — the committee’s ' +
      'goodwill is not infinite. This is the last one.',
    owner: 'the committee',
    constraints: [
      { type: 'sightline', a: 'door', b: 'menu',
        text: 'Committee rule: the noticeboard stays visible from the door.' }
    ]
  }
];

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

const KEY = 'room-to-breathe.progress';

export function loadProgress () {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? { done: {} };
  } catch { return { done: {} }; }
}

export function saveProgress (p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

export function isUnlocked (c, progress) {
  return !c.unlock || !!progress.done[c.unlock];
}

/**
 * Stars. One for signing off at all; one for everyone leaving with plenty
 * still in hand; one for not spending the whole budget. Never fewer than one:
 * a room that works is a room that works.
 */
export function starsFor (results, budgetLeft) {
  let stars = 1;
  const minReserve = Math.min(...results.map(r => r.reserve));
  if (minReserve >= 35) stars++;
  if (budgetLeft >= 1) stars++;
  return stars;
}
