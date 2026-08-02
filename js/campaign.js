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

/**
 * The through-line.
 *
 * Six commissions were six errands. What ties them together is not a plot —
 * nobody is in peril and nothing is revealed in act three — but an argument
 * that gets harder to duck each time you agree with it. It starts with one
 * person who could go somewhere else, moves to a room nobody can opt out of,
 * and ends with three people whose needs do not agree, so that the last
 * decision you make is the one the whole game is about: you cannot average
 * your way to a room that works.
 *
 * The surveyor is deliberately thin. You are not the story. You are the
 * person who measures, and the only thing you ever get to change is the
 * building.
 */
export const FRAME =
  'You survey rooms for access. Not the ramp-and-handrail kind — someone ' +
  'else does that, and does it well. You do the part nobody has a form for: ' +
  'whether a person can actually be in a room long enough to use it.\n\n' +
  'The work is unglamorous. You are given a floor, a budget that is really ' +
  'the owner\u2019s patience, and the names of people the room is currently ' +
  'failing. You move things. You never ask anyone to cope better.'

/**
 * What happens between commissions.
 *
 * Shown once, on the debrief, after the room it belongs to is signed off.
 * Short on purpose: a note, an overheard line, a message. This is where the
 * consequence of the last room arrives and the reason for the next one gets
 * set up, and it is doing the job that a cutscene would do badly.
 */
export const INTERLUDES = {
  'cafe-1':
    'Franco emails a photograph of the new layout with the subject line ' +
    '\u201cLOOK\u201d and no body text. Three weeks later he adds: she comes ' +
    'in on Thursdays now as well.\n\nThe librarian two streets over reads ' +
    'the same local paper as Franco.',
  'library-1':
    'Ollie does not say anything to anyone. He just starts turning up ' +
    'again, in the corner under the new lamp, and stays until closing.\n\n' +
    'This is the part of the job that has no metric. An absence ends. ' +
    'Nobody writes in to tell you.',
  'cafe-2':
    'Two rules and a grant. Franco keeps the grinder where he wants it and ' +
    'the room still works, which he takes as proof that he was right all ' +
    'along, and you let him.\n\nThe practice manager at the health centre ' +
    'has been forwarded your name by someone who did not ask you first.',
  'clinic-1':
    'The practice manager signs the survey without reading it and asks ' +
    'whether you also do offices.\n\nJun sends four words: I stayed inside ' +
    'this time.\n\nThat is the whole report. It is better than the survey.',
  'hall-1':
    'The committee would like to say, for the minutes, that they have ' +
    'always been an inclusive hall.\n\nThey would also like to book you ' +
    'again for the open morning, with less money, because the grant is ' +
    'spent. Mara, Ollie and Jun are all coming. They do not know each ' +
    'other. They will all be in one room at once.'
};

/**
 * The last word, after the last signature.
 *
 * Deliberately not triumphant. The rooms are better and the world is not
 * fixed, and pretending otherwise would undo the argument the game has spent
 * six commissions making carefully.
 */
export const CODA =
  'Nothing you did was expensive. A panel, a lamp, a corner to sit in, a ' +
  'grinder two metres to the left. The rooms were always able to be like ' +
  'this.\n\nWhat you actually changed was who counts as a person the room ' +
  'is for. That is not a small thing and it is not a finished thing. There ' +
  'are more rooms.';

/**
 * What each of them says once the room works.
 *
 * Never "thank you for making this accessible". Nobody talks like that about
 * a café, and having them say it would turn three people into a testimonial.
 * They say what anyone says when a room stops being an obstacle: something
 * about the coffee, or nothing much at all, which is the point.
 *
 * Keyed by room so the same person says something different in the library
 * than in the hall.
 */
export const AFTERWORD = {
  mara: {
    cafe: '\u201cI stayed for the second one. I never stay for the second one.\u201d',
    hall: '\u201cI could hear the person next to me. In here. That is genuinely new.\u201d',
    library: '\u201cIt is not my room, but I would sit in it.\u201d',
    clinic: '\u201cStill a clinic. But I did not have to stand outside it first.\u201d'
  },
  ollie: {
    library: '\u201cGot four hours in. Did not notice the time, which is the good kind.\u201d',
    hall: '\u201cI can look up from the page without it hurting. That is the whole thing.\u201d',
    cafe: '\u201cI would revise here. I would not have said that last month.\u201d',
    clinic: '\u201cI read a whole leaflet in the waiting room. Voluntarily.\u201d'
  },
  jun: {
    clinic: '\u201cI went in at the time on the letter. First time in about four years.\u201d',
    hall: '\u201cI stayed for the whole thing. I had planned to leave at the interval.\u201d',
    cafe: '\u201cI sat with my back to the room. Turns out I did not need to.\u201d',
    library: '\u201cQuiet in the way a place is quiet, not the way you have to be.\u201d'
  }
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
    epigraph: 'Nobody has complained. That is not the same as nothing being wrong.',
    stake: 'One person, one room, and an owner who already wants to know.',
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
    epigraph: 'The regulars you notice are the ones who turn up.',
    stake: 'An absence is evidence. You just have to be the kind of person who counts it.',
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
    epigraph: 'Every room belongs to somebody, and somebody has rules.',
    stake: 'Two people who need different things, and an owner who will not move the grinder.',
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
    epigraph: 'You can decide a caf\u00e9 is not worth it. You cannot decide that about a clinic.',
    stake: 'The first room where leaving is not an option.',
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
    epigraph: 'A room that is fine on average is a room that fails somebody in particular.',
    stake: 'Noise, flicker and glare, in a hall built to echo.',
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
    epigraph: 'Three people. Their needs do not agree. Neither does the budget.',
    stake: 'The argument, with nothing left over to hide behind.',
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

/**
 * Rooms you have signed off stay open, and you can go back into them with
 * nothing to do.
 *
 * This is the closest honest thing to what people mean when they ask for a
 * Stardew feeling: not farming, but a place that is calm because you made it
 * calm, that you are allowed to be in without a task. No timer, no meter, no
 * visitor to get through, no way to fail. It is the reward for the work and
 * it is the only mode in the game with no objective at all.
 */
export function finishedRooms (progress) {
  const seen = new Set();
  return COMMISSIONS
    .filter(c => progress.done[c.id])
    .filter(c => { if (seen.has(c.room)) return false; seen.add(c.room); return true; });
}

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
