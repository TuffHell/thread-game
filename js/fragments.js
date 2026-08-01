/**
 * Fragments found in the weave.
 *
 * IMPORTANT, and this is a claim the game makes on screen so it had better be
 * true: everything in FRAGMENTS below was written for this game. None of it is
 * quoted testimony and none of it is attributed to a real person. It is the
 * game's own voice, informed by the monotropism literature cited in SOURCES.
 *
 * VOICES is deliberately empty. It is the slot for real statements collected
 * with an autism charity partner, with consent and credit. If it is still
 * empty at submission the about panel says so plainly rather than quietly
 * passing off written lines as lived accounts.
 */

export const FRAGMENTS = [
  { at: 'first-descent', text: 'A thing is rarely one thing. It is usually several, holding still.' },
  { at: 'first-descent', text: 'You cannot see what is inside from out here. That is not a failure of looking harder.' },

  { at: 'two-hands', text: 'Coming up is nothing. It is the going back down that costs.' },
  { at: 'two-hands', text: 'I was not ignoring you. I was somewhere.' },

  { at: 'affinity', text: 'The odd thing about the interest everyone calls special is that it is not special to me. It is just the thing.' },
  { at: 'affinity', text: 'Time spent here is not time taken from anything. It is where the rest of it comes from.' },

  { at: 'open-air', text: 'Being pulled out is not the same as stopping.' },
  { at: 'open-air', text: 'I can do it. Ask me twice while I am doing it and I cannot.' },
  { at: 'open-air', text: 'Nobody asks what it costs to come back.' },

  { at: 'deeper', text: 'Some things are held inside things that are held inside things. You are not lost. You are far in.' },

  { at: 'long-weave', text: 'Depth is not the opposite of attention. It is what attention is, when it is left alone.' },
  { at: 'long-weave', text: 'I am not behind. I am somewhere else, and I will bring something back.' }
];

/** Real, citable, and named on the about panel. */
export const SOURCES = [
  {
    what: 'Monotropism',
    who: 'Dinah Murray, Mike Lesser and Wenn Lawson, 2005',
    note: 'Autistic attention as a deep narrow tunnel rather than a broad shallow ' +
          'spread. Two of the three authors were autistic. Everything the depth ' +
          'mechanic does comes from this.'
  },
  {
    what: 'The double empathy problem',
    who: 'Damian Milton, 2012',
    note: 'Communication breakdown between autistic and non-autistic people runs ' +
          'both ways. Why nothing in this game asks the player to be corrected.'
  }
];

/**
 * Statements from autistic people, collected with a charity partner.
 * Empty until they are real. Do not populate this with writing.
 */
export const VOICES = [];

export function fragmentsFor (levelId) {
  return FRAGMENTS.filter(f => f.at === levelId);
}
