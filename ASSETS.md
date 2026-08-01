# Painted backdrops

The reels you liked get their look from AI-generated backdrop paintings with
simple code over the top. This game now has the slots for exactly that. Drop
files into `assets/` with these names and they appear automatically; while a
file is missing, the game simply looks the way it does today. Nothing breaks
either way.

## Files the game looks for

| File | Where it shows | Size |
|---|---|---|
| `assets/title.png` | Title screen, behind the wordmark | 1920×1080 |
| `assets/room-cafe.png` | Brief page for both café commissions | 1920×1080 |
| `assets/room-library.png` | Brief page for the reading room | 1920×1080 |
| `assets/room-clinic.png` | Brief page for the waiting room | 1920×1080 |
| `assets/room-hall.png` | Brief page for both hall commissions | 1920×1080 |

PNG or JPG both work (keep the `.png` name). They render at 50% opacity behind
text, so favour images with a clear dark or mid-tone area and no text baked in.

## Prompts that match the game's world

Use PixelLab, Midjourney, or whatever you have. The style words that matter:
**warm, painted, pixel-art-adjacent, lanterns, no people, no text.** One
suggested prompt per file — adjust freely, keep the mood consistent across
all five.

**title.png** — "cozy warm interior of a small café at dusk seen from the
doorway, empty, warm lamplight pools, plants, wooden floor, painted pixel art
style, soft orange and teal palette, no people, no text"

**room-cafe.png** — "small tiled café interior, espresso machine and grinder
behind a wooden counter, morning light through big windows, warm painted
pixel art, empty, no people, no text"

**room-library.png** — "quiet public library reading room, long wooden
tables, shelves, warm lamps against cool fluorescent panels overhead, painted
pixel art style, empty, no people, no text"

**room-clinic.png** — "health clinic waiting room, rows of chairs, reception
counter, wall-mounted television, slightly too bright, painted pixel art
style, muted colours with warm accents, empty, no people, no text"

**room-hall.png** — "large brick community hall set up for a coffee morning,
folding tables, tea urn, strings of small lights, echoing space, warm painted
pixel art style, empty, no people, no text"

## Rules

- **No people in the backdrops.** The people in this game are Mara, Ollie and
  Jun, and they appear in the simulation, not in wallpaper.
- **No text in the images.** Generated text comes out garbled and reads as
  AI-slop instantly.
- Keep one consistent palette across all five, or the game will feel like
  five different games.
- Commit them like any other file; the deploy picks them up automatically.
