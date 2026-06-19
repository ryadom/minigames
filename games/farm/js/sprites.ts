/* ============================================================================
 *  Farm — drawn textures (pure inline-SVG sprites).
 *
 *  The world used to render every crop and building as a single floating emoji
 *  glyph. This module replaces those with hand-drawn, self-contained SVG
 *  sprites in the same flat-cute style as the scene (`scene.ts`): little timber
 *  buildings, a glass greenhouse, stacked beehives, a notice board, animal
 *  barns, and crops that grow as real plants through their stages.
 *
 *  Everything is a pure string builder — no DOM, no state. Each sprite draws on
 *  a square `0 0 100 100` canvas (every building footprint in the game is
 *  square, so one viewBox fits them all) and the consumer sizes it to the cell.
 *  Keeping the art here lets `view.ts` stay about layout and lets the look of
 *  the farm evolve without touching game logic.
 * ========================================================================== */
import { CROP_BY_ID } from "./config";
import type { Tile } from "./types";

// Wrap raw SVG body in a square, non-distorting svg that fills its host box.
function svg(body: string): string {
  return (
    `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" ` +
    `class="art-svg" aria-hidden="true">${body}</svg>`
  );
}

// A soft contact shadow so a sprite sits on the ground rather than floating.
function shadow(cx = 50, cy = 90, rx = 34, ry = 8): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,0.16)"/>`;
}

/* ============================================================================
 *  BUILDINGS
 * ========================================================================== */

// Market — a striped-awning produce stall with a wooden counter and crates.
function market(): string {
  return svg(
    shadow(50, 92, 36, 7) +
      // back posts
      `<rect x="16" y="20" width="5" height="60" fill="#9c6f3f"/>` +
      `<rect x="79" y="20" width="5" height="60" fill="#9c6f3f"/>` +
      // counter box
      `<rect x="18" y="60" width="64" height="26" rx="3" fill="#caa063"/>` +
      `<rect x="18" y="60" width="64" height="7" fill="#dcb878"/>` +
      `<g stroke="#a9824d" stroke-width="1.4">` +
      `<line x1="34" y1="67" x2="34" y2="86"/><line x1="50" y1="67" x2="50" y2="86"/>` +
      `<line x1="66" y1="67" x2="66" y2="86"/></g>` +
      // striped awning (scalloped front edge)
      `<path d="M12 22 H88 V40 L80 48 L72 40 L64 48 L56 40 L48 48 L40 40 L32 48 L24 40 L16 48 L12 40 Z" fill="#e8554d"/>` +
      `<path d="M28 22 V44 M44 22 V47 M60 22 V47 M76 22 V44" stroke="#fff" stroke-width="8" opacity="0.92"/>` +
      `<rect x="11" y="18" width="78" height="6" rx="3" fill="#8a5a32"/>` +
      // produce on the counter
      `<circle cx="32" cy="58" r="5.5" fill="#e8554d"/><circle cx="40" cy="58" r="5" fill="#ef7d3a"/>` +
      `<circle cx="62" cy="58" r="5.5" fill="#6fc92b"/><circle cx="70" cy="58" r="5" fill="#ffd23f"/>`,
  );
}

// Kitchen — a big cast-iron cooking pot bubbling over a little fire, with
// steam curling up off the stew. (Reads clearly as "the kitchen" at a glance.)
function kitchen(): string {
  return svg(
    shadow(50, 92, 34, 7) +
      // fire stand + flames under the pot
      `<rect x="26" y="84" width="48" height="6" rx="3" fill="#6f4427"/>` +
      `<path d="M34 86 q -4 -9 2 -14 q 0 5 3 6 q 1 -5 4 -7 q 3 7 -1 15 Z" fill="#ffb13f"/>` +
      `<path d="M52 86 q -4 -9 2 -14 q 0 5 3 6 q 1 -5 4 -7 q 3 7 -1 15 Z" fill="#ff8a3f"/>` +
      // side handles
      `<path d="M20 60 q -9 6 0 14" fill="none" stroke="#3d434b" stroke-width="5"/>` +
      `<path d="M80 60 q 9 6 0 14" fill="none" stroke="#3d434b" stroke-width="5"/>` +
      // pot body
      `<path d="M20 56 Q20 86 50 86 Q80 86 80 56 Z" fill="#4f5862"/>` +
      `<path d="M20 56 Q20 86 50 86 Q80 86 80 56 Z" fill="none" stroke="#3d434b" stroke-width="2"/>` +
      // body shine
      `<path d="M30 64 Q30 80 42 85" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4" stroke-linecap="round"/>` +
      // rim
      `<rect x="15" y="50" width="70" height="11" rx="5.5" fill="#6b7680"/>` +
      `<rect x="15" y="50" width="70" height="11" rx="5.5" fill="none" stroke="#566069" stroke-width="1.5"/>` +
      // stew surface + bubbles
      `<ellipse cx="50" cy="53" rx="30" ry="6" fill="#ff9e3f"/>` +
      `<circle cx="40" cy="52" r="3" fill="#ffb866"/><circle cx="58" cy="54" r="2.4" fill="#ffb866"/>` +
      `<circle cx="50" cy="51" r="2" fill="#ffd29e"/>` +
      // steam curling up
      `<path d="M38 46 q -6 -7 0 -13 q 6 -6 0 -13" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M50 44 q -5 -7 0 -13 q 5 -6 0 -13" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M62 46 q 6 -7 0 -13 q -6 -6 0 -13" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="3" stroke-linecap="round"/>`,
  );
}

// Greenhouse — a glass house with a peaked roof and leafy plants inside.
function greenhouse(): string {
  return svg(
    shadow(50, 92, 38, 7) +
      // glass body
      `<path d="M18 38 L50 18 L82 38 V86 H18 Z" fill="#cdeefb" stroke="#fff" stroke-width="2.5"/>` +
      // glazing bars
      `<g stroke="#ffffff" stroke-width="2" opacity="0.85">` +
      `<line x1="34" y1="28" x2="34" y2="86"/><line x1="50" y1="18" x2="50" y2="86"/>` +
      `<line x1="66" y1="28" x2="66" y2="86"/>` +
      `<line x1="18" y1="52" x2="82" y2="52"/><line x1="18" y1="70" x2="82" y2="70"/></g>` +
      // shine
      `<path d="M26 40 L40 26 L44 26 L30 40 Z" fill="#ffffff" opacity="0.5"/>` +
      // plants inside
      `<g>` +
      `<rect x="24" y="74" width="52" height="10" fill="#a9763f"/>` +
      `<circle cx="32" cy="72" r="6" fill="#57a948"/><circle cx="38" cy="70" r="5" fill="#67bd55"/>` +
      `<circle cx="60" cy="72" r="6" fill="#4e9b3f"/><circle cx="66" cy="70" r="5" fill="#67bd55"/>` +
      `<circle cx="49" cy="71" r="3.2" fill="#ff7aa8"/><circle cx="35" cy="69" r="2.6" fill="#ffd23f"/>` +
      `<circle cx="63" cy="69" r="2.6" fill="#e8554d"/></g>` +
      // ridge cap
      `<rect x="46" y="14" width="8" height="8" rx="2" fill="#7fbf4f"/>`,
  );
}

// Apiary — stacked beehive boxes with a couple of bees and a flower.
function apiary(): string {
  const box = (y: number, w: number) =>
    `<rect x="${50 - w / 2}" y="${y}" width="${w}" height="11" rx="2" fill="#f2c14e" stroke="#cf9b34" stroke-width="1.4"/>` +
    `<rect x="${50 - w / 2}" y="${y + 4}" width="${w}" height="3" fill="#e0ad3c"/>`;
  const bee = (x: number, y: number) =>
    `<g><ellipse cx="${x - 2.4}" cy="${y - 1}" rx="2.6" ry="1.8" fill="#fff" opacity="0.85"/>` +
    `<ellipse cx="${x + 2.4}" cy="${y - 1}" rx="2.6" ry="1.8" fill="#fff" opacity="0.85"/>` +
    `<circle cx="${x}" cy="${y}" r="3" fill="#ffce47"/>` +
    `<path d="M${x - 2.6} ${y - 1.4} a3 3 0 0 0 5.2 0" stroke="#3a2b1a" stroke-width="1.2" fill="none"/></g>`;
  return svg(
    shadow(50, 90, 32, 7) +
      // stand
      `<rect x="22" y="80" width="56" height="6" rx="2" fill="#9c6f3f"/>` +
      box(68, 46) +
      box(56, 42) +
      box(44, 38) +
      // peaked lid
      `<path d="M28 44 L50 32 L72 44 Z" fill="#b65b46"/>` +
      // entrance hole
      `<rect x="44" y="72" width="12" height="4" rx="2" fill="#7a4a22"/>` +
      bee(72, 50) +
      bee(30, 62) +
      // flower for flavour
      `<g><line x1="20" y1="86" x2="20" y2="74" stroke="#4e9b3f" stroke-width="2"/>` +
      `<circle cx="20" cy="72" r="4" fill="#ff7aa8"/><circle cx="20" cy="72" r="1.6" fill="#ffd23f"/></g>`,
  );
}

// Quest board — a wooden notice board on posts with pinned papers.
function board(): string {
  return svg(
    shadow(50, 90, 26, 6) +
      `<rect x="26" y="40" width="6" height="48" fill="#9c6f3f"/>` +
      `<rect x="68" y="40" width="6" height="48" fill="#9c6f3f"/>` +
      // board
      `<rect x="20" y="28" width="60" height="40" rx="3" fill="#b5854f" stroke="#8a5a32" stroke-width="2.5"/>` +
      `<g stroke="#a0743f" stroke-width="1.2">` +
      `<line x1="20" y1="41" x2="80" y2="41"/><line x1="20" y1="55" x2="80" y2="55"/></g>` +
      // little roof
      `<path d="M16 30 L50 18 L84 30 Z" fill="#c75b46"/>` +
      // pinned papers
      `<g fill="#fdf7e8">` +
      `<rect x="28" y="34" width="16" height="13" rx="1.5" transform="rotate(-5 36 40)"/>` +
      `<rect x="54" y="33" width="16" height="13" rx="1.5" transform="rotate(4 62 39)"/>` +
      `<rect x="40" y="48" width="18" height="13" rx="1.5" transform="rotate(-2 49 54)"/></g>` +
      `<g stroke="#c9b88a" stroke-width="1"><line x1="30" y1="38" x2="42" y2="37"/>` +
      `<line x1="56" y1="37" x2="68" y2="38"/><line x1="43" y1="52" x2="55" y2="52"/></g>` +
      `<circle cx="36" cy="34" r="1.6" fill="#e8554d"/><circle cx="62" cy="33" r="1.6" fill="#4e9bd4"/>` +
      `<circle cx="49" cy="48" r="1.6" fill="#7fbf4f"/>`,
  );
}

// Animal pen — a fenced grassy paddock with room for the animal to roam.
// The back and side fences enclose an open-front yard; the animal emoji is
// drawn (and walked) on top by the view. Used for every pen type.
function paddock(): string {
  // A single wooden fence post (a small rounded plank).
  const post = (x: number, y0: number, y1: number) =>
    `<rect x="${x - 2}" y="${y0}" width="4" height="${y1 - y0}" rx="1.5" fill="#c9a26a" stroke="#a9824d" stroke-width="0.8"/>`;
  return svg(
    shadow(50, 92, 40, 8) +
      // grassy paddock floor
      `<rect x="12" y="46" width="76" height="42" rx="9" fill="#8fc861"/>` +
      `<rect x="12" y="46" width="76" height="42" rx="9" fill="none" stroke="#7ab84f" stroke-width="1.2"/>` +
      // grass tufts + a flower for a bit of life
      `<path d="M24 80 q1 -5 0 -8 M27 80 q0 -6 2 -9 M30 80 q1 -5 2 -7" stroke="#6fb049" stroke-width="1.4" fill="none"/>` +
      `<path d="M68 83 q1 -5 0 -8 M71 83 q0 -6 2 -9" stroke="#6fb049" stroke-width="1.4" fill="none"/>` +
      `<circle cx="78" cy="74" r="2.4" fill="#ff7aa8"/><circle cx="78" cy="74" r="1" fill="#ffd23f"/>` +
      // left & right side rails (open at the front so you can see in)
      `<rect x="10.5" y="52" width="3" height="34" rx="1.5" fill="#cda263"/>` +
      `<rect x="86.5" y="52" width="3" height="34" rx="1.5" fill="#cda263"/>` +
      post(12, 48, 64) +
      post(12, 70, 86) +
      post(88, 48, 64) +
      post(88, 70, 86) +
      // back fence — two rails across the top with posts
      `<rect x="12" y="40" width="76" height="3.6" rx="1.8" fill="#dab57e"/>` +
      `<rect x="12" y="47" width="76" height="3.6" rx="1.8" fill="#c9a05c"/>` +
      post(18, 36, 54) +
      post(34, 36, 54) +
      post(50, 36, 54) +
      post(66, 36, 54) +
      post(82, 36, 54),
  );
}

const BUILDINGS: Record<string, () => string> = {
  market,
  kitchen,
  greenhouse,
  apiary,
  board,
};

/* ============================================================================
 *  ANIMALS — little drawn livestock that roam their pens.
 *
 *  Each is a self-contained SVG creature in the same flat-cute style, drawn
 *  **facing right** and standing low on the square canvas so it sits on the
 *  paddock grass. The view layer (`view.ts`) renders one per owned animal in a
 *  persistent layer and walks them around independently; it flips the sprite
 *  (scaleX) when an animal heads left, so every drawing only ever faces right.
 * ========================================================================== */

// Chicken — plump white hen with a red comb, orange beak and stick legs.
function chicken(): string {
  return svg(
    shadow(50, 86, 22, 5) +
      // legs + feet
      `<g stroke="#e8973a" stroke-width="3" stroke-linecap="round">` +
      `<line x1="46" y1="73" x2="44" y2="85"/><line x1="56" y1="73" x2="58" y2="85"/></g>` +
      `<path d="M40 86 l-4 2 M44 86 l4 2 M54 86 l-4 2 M58 86 l4 2" stroke="#e8973a" stroke-width="2.4" stroke-linecap="round"/>` +
      // tail feathers (back/left)
      `<path d="M30 58 q -16 -6 -18 -20 q 15 5 21 13 Z" fill="#ece6da"/>` +
      `<path d="M30 63 q -15 0 -19 -10 q 13 1 19 1 Z" fill="#fff"/>` +
      // body
      `<ellipse cx="50" cy="60" rx="21" ry="17" fill="#fff" stroke="#e9e2d4" stroke-width="1.5"/>` +
      // wing
      `<path d="M48 53 q 15 2 17 15 q -10 4 -19 -3 Z" fill="#f1ece1"/>` +
      // head
      `<circle cx="64" cy="44" r="11" fill="#fff" stroke="#e9e2d4" stroke-width="1.4"/>` +
      // comb
      `<path d="M57 35 q 2 -6 5 -3 q 2 -6 5 -2 q 3 -4 4 2 q -1 5 -7 4 q -5 1 -7 -1 Z" fill="#e8554d"/>` +
      // beak (points right)
      `<path d="M74 42 l 12 -1 l -11 7 Z" fill="#f5a623"/>` +
      // wattle
      `<path d="M70 50 q 2 7 -2 9 q -3 -1 -2 -8 Z" fill="#e8554d"/>` +
      // eye
      `<circle cx="66" cy="42" r="2" fill="#2a2320"/>`,
  );
}

// Cow — big spotted body, horned head with a pink muzzle, tufted tail.
function cow(): string {
  return svg(
    shadow(50, 88, 30, 6) +
      // tail
      `<path d="M24 56 q -10 8 -7 23" fill="none" stroke="#d9d4cb" stroke-width="3"/>` +
      `<circle cx="17" cy="80" r="3.6" fill="#6b4a35"/>` +
      // legs + hooves
      `<g fill="#efe9df">` +
      `<rect x="31" y="66" width="8" height="22" rx="3"/><rect x="44" y="68" width="8" height="20" rx="3"/>` +
      `<rect x="58" y="68" width="8" height="20" rx="3"/></g>` +
      `<g fill="#3a2b24"><rect x="31" y="84" width="8" height="5" rx="2"/>` +
      `<rect x="44" y="84" width="8" height="4" rx="2"/><rect x="58" y="84" width="8" height="4" rx="2"/></g>` +
      // body
      `<ellipse cx="47" cy="57" rx="27" ry="18" fill="#fbf7f0" stroke="#e4ddd0" stroke-width="1.5"/>` +
      // spots
      `<path d="M33 49 q 9 -5 13 3 q -2 9 -11 6 q -6 -5 -2 -9 Z" fill="#6b4a35"/>` +
      `<ellipse cx="57" cy="63" rx="9" ry="6.5" fill="#6b4a35"/>` +
      // head (right)
      `<ellipse cx="74" cy="52" rx="13" ry="12" fill="#fbf7f0" stroke="#e4ddd0" stroke-width="1.4"/>` +
      // ears
      `<ellipse cx="63" cy="44" rx="4.6" ry="3" fill="#f0d9c8" transform="rotate(-28 63 44)"/>` +
      `<ellipse cx="85" cy="45" rx="4.6" ry="3" fill="#f0d9c8" transform="rotate(28 85 45)"/>` +
      // horns
      `<path d="M68 41 q -3 -6 1 -9" stroke="#e6d9b8" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<path d="M80 41 q 3 -6 -1 -9" stroke="#e6d9b8" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      // muzzle + nostrils
      `<ellipse cx="76" cy="59" rx="9" ry="6" fill="#f6c1c9"/>` +
      `<circle cx="73" cy="59" r="1.4" fill="#3a2b24"/><circle cx="80" cy="59" r="1.4" fill="#3a2b24"/>` +
      // eyes
      `<circle cx="71" cy="48" r="2" fill="#2a2320"/><circle cx="80" cy="48" r="2" fill="#2a2320"/>`,
  );
}

// Sheep — a cloud of cream wool puffs with a dark face and slim legs.
function sheep(): string {
  const wool = "#f6f1e7";
  return svg(
    shadow(50, 88, 27, 6) +
      // legs
      `<g fill="#5b4a44"><rect x="37" y="68" width="5" height="19" rx="2.5"/>` +
      `<rect x="49" y="70" width="5" height="17" rx="2.5"/><rect x="60" y="68" width="5" height="19" rx="2.5"/></g>` +
      // woolly body — overlapping puffs
      `<g fill="${wool}" stroke="#e7e0d2" stroke-width="1.2">` +
      `<circle cx="37" cy="57" r="13"/><circle cx="51" cy="51" r="15"/><circle cx="64" cy="59" r="12"/>` +
      `<circle cx="45" cy="65" r="11"/><circle cx="59" cy="67" r="10"/></g>` +
      // head (right, dark)
      `<ellipse cx="72" cy="56" rx="10" ry="11" fill="#5e4d46"/>` +
      // ears
      `<ellipse cx="64" cy="50" rx="5" ry="3" fill="#52423c" transform="rotate(-22 64 50)"/>` +
      `<ellipse cx="80" cy="50" rx="5" ry="3" fill="#52423c" transform="rotate(22 80 50)"/>` +
      // wool tuft on head
      `<circle cx="72" cy="46" r="6" fill="${wool}"/>` +
      // muzzle + eyes
      `<ellipse cx="74" cy="61" rx="6" ry="4.5" fill="#7a665e"/>` +
      `<circle cx="69" cy="54" r="1.8" fill="#1f1a17"/><circle cx="77" cy="54" r="1.8" fill="#1f1a17"/>`,
  );
}

// Pig — round pink body, snout with nostrils, floppy ear and a curly tail.
function pig(): string {
  const pink = "#f3a9bd";
  const dark = "#d98aa2";
  return svg(
    shadow(50, 88, 28, 6) +
      // curly tail
      `<path d="M24 58 q -9 -1 -7 -8 q 2 -6 8 -2" fill="none" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>` +
      // legs
      `<g fill="${dark}"><rect x="33" y="66" width="8" height="22" rx="3"/><rect x="46" y="68" width="8" height="20" rx="3"/>` +
      `<rect x="58" y="68" width="8" height="20" rx="3"/></g>` +
      // body
      `<ellipse cx="47" cy="59" rx="26" ry="18" fill="${pink}" stroke="${dark}" stroke-width="1.4"/>` +
      // ear
      `<path d="M65 41 q 6 -8 13 -4 q 0 9 -7 12 Z" fill="${dark}"/>` +
      // head
      `<circle cx="72" cy="56" r="13" fill="${pink}" stroke="${dark}" stroke-width="1.3"/>` +
      // snout
      `<ellipse cx="82" cy="58" rx="8" ry="6.5" fill="${dark}"/>` +
      `<ellipse cx="83" cy="58" rx="1.5" ry="2.4" fill="#9c5e72"/><ellipse cx="79" cy="58" rx="1.5" ry="2.4" fill="#9c5e72"/>` +
      // eye
      `<circle cx="70" cy="50" r="2" fill="#3a2630"/>`,
  );
}

const ANIMAL_ART: Record<string, () => string> = {
  chicken,
  cow,
  sheep,
  pig,
};

/** Drawn art for a single roaming animal (or "" for an unknown type). */
export function animalSprite(type: string): string {
  const fn = ANIMAL_ART[type];
  return fn ? fn() : "";
}

/** Drawn art for a placed building / pen tile, or "" if it has no sprite. */
export function buildingArt(t: Tile): string {
  if (t.kind === "pen") return paddock();
  const fn = BUILDINGS[t.kind];
  return fn ? fn() : "";
}

/** Drawn art for a build id (used by the build catalog & placement preview). */
export function buildArtById(id: string): string {
  if (id.startsWith("pen-")) return paddock();
  const fn = BUILDINGS[id === "kitchen" ? "kitchen" : id];
  return fn ? fn() : "";
}

/* ============================================================================
 *  CROPS — a plant that grows through four stages on a soil mound.
 * ========================================================================== */

// 0 = just sown, 1 = sprout, 2 = leafy, 3 = ripe (carries the crop's fruit).
export type CropStage = 0 | 1 | 2 | 3;

export function cropStage(grown: number, grow: number): CropStage {
  const f = grow > 0 ? grown / grow : 0;
  if (f >= 1) return 3;
  if (f < 0.34) return 0;
  if (f < 0.67) return 1;
  return 2;
}

// Soil mound every stage sits on, so plots read as tilled rather than flat.
const MOUND =
  `<ellipse cx="50" cy="84" rx="30" ry="9" fill="#6f4427"/>` +
  `<ellipse cx="50" cy="81" rx="28" ry="8" fill="#8a5a30"/>`;

// A single leaf as a teardrop, rooted at (x,y) and angled by `rot` degrees.
function leaf(x: number, y: number, rot: number, len: number, fill: string): string {
  return (
    `<path d="M${x} ${y} q ${len * 0.5} ${-len * 0.5} 0 ${-len} q ${-len * 0.5} ${len * 0.5} 0 ${len} Z" ` +
    `fill="${fill}" transform="rotate(${rot} ${x} ${y})"/>`
  );
}

function cropSeed(): string {
  return svg(
    MOUND +
      // poking sprout tip
      `<path d="M50 80 q -1 -7 0 -12" stroke="#5a8a36" stroke-width="2.4" fill="none"/>` +
      leaf(50, 70, -18, 8, "#7fbf4f") +
      `<circle cx="44" cy="83" r="1.6" fill="#5d3a20"/><circle cx="57" cy="82" r="1.4" fill="#5d3a20"/>`,
  );
}

function cropSprout(): string {
  return svg(
    MOUND +
      `<path d="M50 82 V58" stroke="#4e9b3f" stroke-width="2.8" fill="none"/>` +
      leaf(50, 66, -42, 13, "#67bd55") +
      leaf(50, 66, 42, 13, "#57a948") +
      leaf(50, 58, 0, 12, "#7fbf4f"),
  );
}

function cropLeafy(): string {
  return svg(
    MOUND +
      `<path d="M50 82 V48" stroke="#4e9b3f" stroke-width="3.2" fill="none"/>` +
      leaf(50, 74, -55, 18, "#57a948") +
      leaf(50, 74, 55, 18, "#4e9b3f") +
      leaf(50, 62, -38, 18, "#67bd55") +
      leaf(50, 62, 38, 18, "#57a948") +
      leaf(50, 50, 0, 16, "#7fbf4f"),
  );
}

// Ripe: the leafy bush plus the crop's own emoji as the fruit it bears.
function cropRipe(ico: string): string {
  return svg(
    MOUND +
      leaf(50, 78, -62, 20, "#4e9b3f") +
      leaf(50, 78, 62, 20, "#458a39") +
      leaf(50, 66, -44, 19, "#57a948") +
      leaf(50, 66, 44, 19, "#4e9b3f") +
      `<text x="50" y="52" font-size="46" text-anchor="middle" dominant-baseline="central">${ico}</text>`,
  );
}

/** Drawn art for a soil plot's crop at a given growth stage. */
export function cropArt(cropId: string, stage: CropStage): string {
  if (stage === 0) return cropSeed();
  if (stage === 1) return cropSprout();
  if (stage === 2) return cropLeafy();
  return cropRipe(CROP_BY_ID[cropId]?.ico || "🌱");
}
