# THREAD

A browser game about depth of attention, and what it costs to lose it. You
dive into a weave of strands and go further in, and the water takes the warm
colours out of the world as you sink.

A strand is never one thing. Hold it long enough and it opens into a bundle of
other strands, and inside that bundle is the only place you can change what the
strand is. Getting a signal from one end of the weave to the other means going
in, several times, and staying long enough to do something once you are there.

Built for the CodeBuddy track. Static site, no build step, no backend.

---

## Running it

Any static server. There is nothing to install and nothing to compile.

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`. ES modules need HTTP, so opening
`index.html` from the filesystem will not work.

### Deploying on Cloud Studio

Upload the repository as-is and serve the root directory. `index.html` is the
entry point. There is no `dist/`, no bundler and no environment config, so
nothing about the deploy can break in a way that local testing would not have
caught.

---

## The idea it is built on

Monotropism, from Dinah Murray, Mike Lesser and Wenn Lawson. Two of the three
authors were autistic. It describes autistic attention as a deep narrow tunnel
rather than a broad shallow spread, which is where flow states, absorbing
interests, and the genuine pain of being interrupted all come from.

The design rule that follows from it, and that everything here obeys: the game
changes the world around the player rather than asking the player to be
different. Nobody is trained out of anything. Depth is the strength, and the
room is the problem.

---

## What is in it

**Plucked strings, and beating as the answer.** Notes are generated with
Karplus-Strong straight into a buffer, so the harp is a few hundred lines of
code and no audio assets. Tuning plays the bundle's note against the note it
is reaching for, and the two interfere: wide apart and they clash, close and
you get a slow pulse that slows further as you approach, gone when you land.
That is how tuning a real string works, and it means you can hear a bundle
come into tune before you read the meter. It also gives the puzzle a channel
that does not depend on seeing colour.

**Water that takes the warm colours first.** Red goes within a few metres,
then orange, then yellow, and what survives further down is blue and green.
Descending does not tint the picture, it removes part of it, so depth is
legible from the colour of the world before you look at any gauge. The
composite meter deliberately opts out of this: an instrument you are reading
has to stay accurate even when the water is lying to you.

**A first few minutes that teach by doing.** Every prompt is triggered by what
the player is doing or failing to do, never by a clock, and each one clears
itself the moment the thing it asked for happens. If someone stalls, a blunter
version of the same advice replaces the one on screen. Nothing is modal,
nothing blocks input, and it switches off for good after the first weave.

**Depth that actually contains information.** Descending is not a stat
increase. The board genuinely holds more the further in you go, and a puzzle
whose answer lives two levels down cannot be brute-forced from the surface,
because the pieces are not visible up there.

**Descent is slow, ascent is instant.** Losing depth is free. Regaining it is
not. Every other decision in the game hangs off that asymmetry.

**The attention lens.** Sight is clear where attention has settled and softens
further out, and it sharpens the longer you hold still. It suggests a centre
without deleting the board, because a game about how attention works should
still be playable.

**Attention as the only resource.** It accrues while you are deep and
undisturbed, barely at all on the surface, and fastest inside the strand you
are drawn to. Tuning spends it. Nothing else does.

**The affinity strand.** One strand per level is yours. It is a dead end and
the puzzle never needs it, and time spent inside it is what pays for
everything else. An absorbing interest as a source of capacity rather than a
symptom.

**Masking.** Presenting as fine and available. It works: people mostly leave
you alone. It also runs continuously off the same attention you were going to
spend on the work. Measured at depth it comes to roughly minus 0.002 attention
per second, which means masking eats almost exactly what being deep earns you.
You are absorbed in something and treading water. The game has no opinion about
whether you should do it, and the reflection reports what it cost without a
verdict attached.

**Settling.** A repeating self-directed motion that does nothing to the puzzle,
cannot be optimised and is never required. It is available everywhere including
the surface, it gives attention back faster than anything except your own
strand, and it is the one thing masking does not suppress. Stimming as
regulation rather than a symptom to be trained out.

**Attention shifts are hard in both directions.** Choosing to surface takes a
moment and holds a ring while it happens. Being pulled out by an interruption
takes none at all. That asymmetry is the argument, and it only lands once you
have felt both.

**Interruptions that cost depth, never lives.** They cannot fail you or end a
level. They take everything you have built and nothing else, which is quite
enough. The calls are mundane on purpose. Nobody in them is being cruel and
most think they are being kind, which is what makes the cost invisible to
everyone except the person paying it.

**Fragments found rather than announced.** Short lines surface the first time
you go somewhere new. They are the game's own writing, they are clearly stated
as such, and the slot for real statements collected with a charity partner is
built and visibly empty rather than filled with writing pretending to be
testimony.

**The predictability contract.** Nothing arrives without warning. The game says
something is coming before it comes. Ambush would be cheap, and it would also
make the game unusable for a good part of the audience.

**Refusal.** You can hold an interruption off. It keeps your depth and it comes
back for you sooner. Both of those are true at once, and the game does not tell
you which to pick.

**Calibration before anything moves.** Palette, motion, glow, sound, peripheral
softening and whether the world interrupts at all, set before the first frame
and changeable at any time from the same controls. Not a settings menu, not an
accessibility submenu, just the first thing that happens.

**Three complete palettes.** Deep, Quiet and Plain are three finished designs,
not one design with a filter over it. Sound is off by default, always, and
every tone is ramped so nothing can arrive suddenly.

**No fail state anywhere.** Running out of attention costs time and nothing
else. A game about the cost of losing focus should not also punish you for
losing focus.

**A reflection, not a score.** Levels end with what happened: how deep you got,
how much depth you lost, how long you spent in the strand that was yours. There
are no stars and no ranking. Scoring someone on how well they resisted being
interrupted would be a strange thing to do.

---

## How it is put together

```
index.html          shell and all interface markup
css/style.css       one stylesheet, palette driven by custom properties
js/config.js        tuning constants, palettes, frequency maths
js/weave.js         data model, geometry, signal propagation, solving
js/levels.js        the six weaves
js/camera.js        view fitting and the descent transition
js/render.js        canvas drawing
js/audio.js         Karplus-Strong harp, beating as tuning feedback
js/teach.js         the first few minutes, triggered by play not by a clock
js/fragments.js     found lines, real citations, the empty voices slot
js/interrupt.js     the interruption system
js/ui.js            calibration, HUD, reflection, settings drawer
js/game.js          the controller that ties it together
js/main.js          boot and the frame loop
test/solvable.mjs   level solvability check
```

The one rule worth knowing before editing anything is in `weave.js`, in
`effectiveFreq()`. A strand that contains other strands has no frequency of its
own. It is the circular mean of what it holds. That single line is why you have
to go inside to change anything, and every level depends on it.

---

## Tests

```bash
node test/solvable.mjs
```

Simulates the policy a real player follows: find whichever strand is currently
blocking the signal, go into it, and tune whatever moves its average closest to
what the signal needs. It fails a level that cannot be finished that way, and
it separately fails a nested level that turns out to be solvable *without* ever
going to depth two, since a nesting nobody has to enter is just decoration.

Current state:

```
PASS  first-descent   tunes=  4  maxDepth=1  strands=1
PASS  two-hands       tunes= 14  maxDepth=1  strands=2
PASS  affinity        tunes=  8  maxDepth=1  strands=4
PASS  open-air        tunes= 25  maxDepth=1  strands=3
PASS  deeper          tunes= 11  maxDepth=2  strands=2  (depth 2 required)
PASS  long-weave      tunes= 30  maxDepth=2  strands=5  (depth 2 required)
```

Run it after touching any frequency in `levels.js`. Chain hops that get too
large for `RULES.tolerance` make the puzzle thrash, where fixing one hop breaks
the one before it, and the test catches that as a timeout rather than letting
it reach a player.

---

## Editing levels

Levels are built from `bundle([...])`, which takes frequencies from 0 to 1
around a colour wheel. A number is a plain strand, `{ freq, locked: true }` is
one that will not move, and `{ freq: 0, inner: bundle([...]) }` nests another
bundle inside.

Two things to keep in mind. Each tune rotates one strand by `1/24`, so a bundle
of *n* strands moves by roughly `1/(24n)` per tune, which means large bundles
are slow to shift. And to force a second descent, lock everything in the outer
bundle except the nested one, or the player will simply solve it from the
first level down.

`window.thread` is exposed in the console with the game, the settings object
and the solver helpers, for tuning without a reload.

---

## Controls

| | |
|---|---|
| hold a bundle | go inside |
| click a strand | tune it up |
| shift-click | tune it down |
| hold esc | come up one level, which takes a moment |
| arrow keys | move between strands |
| enter or space | descend, or tune |
| `[` and `]` | tune down and up |
| `m` | mask |
| hold `s` | settle |

Full keyboard play, no timers anywhere, and every state change announced to
screen readers through a live region.
