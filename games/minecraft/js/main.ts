/* ==========================================================================
   Mini Craft — a small first-person voxel sandbox rendered with raw WebGL.

   Boot wires together: the procedural texture atlas (textures.ts), the voxel
   world + mesher (world.ts), a WebGL renderer, first-person walking/flying
   physics with block raycasting, and input for both desktop (pointer lock +
   keyboard/mouse) and touch (on-screen stick, look drag and buttons). The
   seed and every edited block are persisted via the shared save store.
   ========================================================================== */

import { MG } from "../../../shared/mg";
import type { HeaderUI, SaveStore } from "../../../shared/types";
import { AIR, HOTBAR, isSolid, WATER } from "./blocks";
import { createProgram, createTexture, type GL } from "./glutil";
import { registerI18n } from "./i18n";
import * as mat4 from "./mat4";
import { buildAtlas, tileIcon } from "./textures";
import { CHUNK, chunkKey, FLOATS_PER_VERT, type MeshArrays, World, WY } from "./world";

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

registerI18n();

/* ------------------------------------------------------------------ setup */

const canvas = $("game") as HTMLCanvasElement;
const stage = $("stage");
const gl = (canvas.getContext("webgl", { antialias: false, alpha: false }) ||
  canvas.getContext("experimental-webgl")) as GL | null;
if (!gl) throw new Error("WebGL not available");
const GLc = gl;

const ui: HeaderUI = MG.mountHeader({
  icon: "⛏️",
  titleKey: "title",
  stats: [
    { key: "pos", labelKey: "pos", variant: "sm", value: "0, 0, 0" },
    { key: "block", labelKey: "block", variant: "sm", value: "" },
  ],
  actions: [
    { key: "fly", labelKey: "fly", onClick: () => toggleFly() },
    { key: "new", labelKey: "newWorld", onClick: () => newWorld() },
  ],
});

const SKY: [number, number, number] = [0.55, 0.78, 1.0];

/* ----------------------------------------------------------------- shader */

const VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aLight;
attribute float aAlpha;
uniform mat4 uMVP;
uniform vec3 uEye;
varying vec2 vUV;
varying float vLight;
varying float vAlpha;
varying float vDist;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV;
  vLight = aLight;
  vAlpha = aAlpha;
  vDist = length(aPos - uEye);
}`;

const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uFog;
uniform float uNear;
uniform float uFar;
varying vec2 vUV;
varying float vLight;
varying float vAlpha;
varying float vDist;
void main() {
  vec4 c = texture2D(uTex, vUV);
  if (c.a < 0.1) discard;
  vec3 rgb = c.rgb * vLight;
  float f = clamp((vDist - uNear) / (uFar - uNear), 0.0, 1.0);
  rgb = mix(rgb, uFog, f);
  gl_FragColor = vec4(rgb, c.a * vAlpha);
}`;

const prog = createProgram(GLc, VS, FS);
GLc.useProgram(prog);

const aPos = GLc.getAttribLocation(prog, "aPos");
const aUV = GLc.getAttribLocation(prog, "aUV");
const aLight = GLc.getAttribLocation(prog, "aLight");
const aAlpha = GLc.getAttribLocation(prog, "aAlpha");
const uMVP = GLc.getUniformLocation(prog, "uMVP");
const uEye = GLc.getUniformLocation(prog, "uEye");
const uTex = GLc.getUniformLocation(prog, "uTex");
const uFog = GLc.getUniformLocation(prog, "uFog");
const uNear = GLc.getUniformLocation(prog, "uNear");
const uFar = GLc.getUniformLocation(prog, "uFar");

GLc.enableVertexAttribArray(aPos);
GLc.enableVertexAttribArray(aUV);
GLc.enableVertexAttribArray(aLight);
GLc.enableVertexAttribArray(aAlpha);

GLc.enable(GLc.DEPTH_TEST);
GLc.clearColor(SKY[0], SKY[1], SKY[2], 1);

// Texture atlas → GPU.
const atlas = buildAtlas();
const tex = createTexture(GLc, atlas);
GLc.activeTexture(GLc.TEXTURE0);
GLc.bindTexture(GLc.TEXTURE_2D, tex);
GLc.uniform1i(uTex, 0);
GLc.uniform3fv(uFog, SKY);
GLc.uniform1f(uNear, 34);
GLc.uniform1f(uFar, 62);

/* --------------------------------------------------------- chunk buffers */

interface GLMesh {
  vbo: WebGLBuffer;
  ibo: WebGLBuffer;
  count: number;
}
interface ChunkGL {
  opaque: GLMesh | null;
  trans: GLMesh | null;
}

// Live GL meshes, keyed by chunkKey(cx, cz). The set of resident chunks
// streams in/out as the player moves (see manageChunks).
const chunkGL = new Map<number, ChunkGL>();
// Chunks whose centre is farther than this (horizontally) aren't drawn; sits
// just beyond the fog far plane so culling never pops geometry into view.
const RENDER_DIST = 72;
// Chunk-radius (in chunks) kept meshed around the player, comfortably covering
// RENDER_DIST so nothing pops into view, and how far before they're evicted.
const VIEW_CHUNKS = 6;
const KEEP_CHUNKS = VIEW_CHUNKS + 2;
// Cap how many chunks are (re)meshed per frame so streaming never hitches.
const BUILD_BUDGET = 2;

function uploadMesh(m: MeshArrays): GLMesh | null {
  if (m.count === 0) return null;
  const vbo = GLc.createBuffer() as WebGLBuffer;
  GLc.bindBuffer(GLc.ARRAY_BUFFER, vbo);
  GLc.bufferData(GLc.ARRAY_BUFFER, m.data, GLc.STATIC_DRAW);
  const ibo = GLc.createBuffer() as WebGLBuffer;
  GLc.bindBuffer(GLc.ELEMENT_ARRAY_BUFFER, ibo);
  GLc.bufferData(GLc.ELEMENT_ARRAY_BUFFER, m.index, GLc.STATIC_DRAW);
  return { vbo, ibo, count: m.count };
}

function freeMesh(m: GLMesh | null): void {
  if (!m) return;
  GLc.deleteBuffer(m.vbo);
  GLc.deleteBuffer(m.ibo);
}

function freeChunkGL(c: ChunkGL): void {
  freeMesh(c.opaque);
  freeMesh(c.trans);
}

/** Mesh a chunk and upload it, replacing any existing GL buffers. */
function buildChunk(cx: number, cz: number): void {
  const key = chunkKey(cx, cz);
  const prev = chunkGL.get(key);
  if (prev) freeChunkGL(prev);
  const mesh = world.buildChunkMesh(cx, cz);
  chunkGL.set(key, { opaque: uploadMesh(mesh.opaque), trans: uploadMesh(mesh.trans) });
}

/** Re-mesh an already-resident chunk (after an edit). Chunks that aren't
 *  resident are skipped — they'll be meshed correctly when they stream in. */
function rebuildChunk(cx: number, cz: number): void {
  if (chunkGL.has(chunkKey(cx, cz))) buildChunk(cx, cz);
}

/** Drop every resident chunk (used when starting a fresh world). */
function clearChunks(): void {
  for (const c of chunkGL.values()) freeChunkGL(c);
  chunkGL.clear();
}

/** Stream chunks in/out around the player: evict far ones, then mesh the
 *  nearest missing ones (budgeted per frame). */
function manageChunks(): void {
  const pcx = Math.floor(player.x) >> 4;
  const pcz = Math.floor(player.z) >> 4;

  for (const [key, c] of chunkGL) {
    const cx = key >> 16;
    const cz = (key << 16) >> 16;
    if (Math.abs(cx - pcx) > KEEP_CHUNKS || Math.abs(cz - pcz) > KEEP_CHUNKS) {
      freeChunkGL(c);
      chunkGL.delete(key);
    }
  }
  // Also drop voxel data (including meshing-neighbour chunks that never got a
  // mesh) so memory stays bounded as the player roams. +1 keeps the ring the
  // outermost resident meshes read from.
  world.prune(pcx, pcz, KEEP_CHUNKS + 1);

  let budget = BUILD_BUDGET;
  for (let r = 0; r <= VIEW_CHUNKS && budget > 0; r++) {
    for (let dz = -r; dz <= r && budget > 0; dz++) {
      for (let dx = -r; dx <= r && budget > 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring edge only
        const cx = pcx + dx;
        const cz = pcz + dz;
        if (chunkGL.has(chunkKey(cx, cz))) continue;
        buildChunk(cx, cz);
        budget--;
      }
    }
  }
}

/** Mesh the chunks closest to the player up front so spawning isn't empty. */
function primeChunks(): void {
  const pcx = Math.floor(player.x) >> 4;
  const pcz = Math.floor(player.z) >> 4;
  const r = 3;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) buildChunk(pcx + dx, pcz + dz);
  }
}

const STRIDE = FLOATS_PER_VERT * 4;
function drawMesh(m: GLMesh): void {
  GLc.bindBuffer(GLc.ARRAY_BUFFER, m.vbo);
  GLc.vertexAttribPointer(aPos, 3, GLc.FLOAT, false, STRIDE, 0);
  GLc.vertexAttribPointer(aUV, 2, GLc.FLOAT, false, STRIDE, 12);
  GLc.vertexAttribPointer(aLight, 1, GLc.FLOAT, false, STRIDE, 20);
  GLc.vertexAttribPointer(aAlpha, 1, GLc.FLOAT, false, STRIDE, 24);
  GLc.bindBuffer(GLc.ELEMENT_ARRAY_BUFFER, m.ibo);
  GLc.drawElements(GLc.TRIANGLES, m.count, GLc.UNSIGNED_SHORT, 0);
}

/* --------------------------------------------------------------- world + save */

interface SaveData {
  seed: number;
  edits: [number, number, number, number][]; // [x, y, z, block]
  px: number;
  py: number;
  pz: number;
  yaw: number;
  pitch: number;
  sel: number;
}

// Legacy (v1) world half-extent: edits were stored as a flat voxel index into
// an 80×WY×80 box. v2 stores explicit [x, y, z, block] for the infinite world.
const LEGACY_W = 80;

const store: SaveStore<SaveData> = MG.storage("minecraft", {
  version: 2,
  migrations: {
    2: (d: { seed: number; edits?: [number, number][] } & Record<string, unknown>) => {
      const edits: [number, number, number, number][] = (d.edits || []).map(([idx, block]) => {
        const x = idx % LEGACY_W;
        const rem = Math.floor(idx / LEGACY_W);
        const z = rem % LEGACY_W;
        const y = Math.floor(rem / LEGACY_W);
        return [x, y, z, block];
      });
      return { ...d, edits };
    },
  },
});

let world: World;

/** Set a block; the world records the edit so it can be re-saved. */
function setBlock(x: number, y: number, z: number, block: number): void {
  world.set(x, y, z, block);
}

const player = {
  x: 0.5,
  y: 40,
  z: 0.5,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: -0.2,
  onGround: false,
  fly: false,
};
let sel = 0; // hotbar index

/** Highest solid block in a column, or -1 if it has none. */
function columnTop(x: number, z: number): number {
  for (let y = WY - 3; y >= 0; y--) {
    if (isSolid(world.get(x, y, z))) return y;
  }
  return -1;
}

/** A column is a valid spawn if it has solid ground topped by two air blocks
 *  (dry land with head-room — not underwater and not buried in a tree). */
function standableTop(x: number, z: number): number {
  const top = columnTop(x, z);
  if (top < 0) return -1;
  if (world.get(x, top + 1, z) !== AIR || world.get(x, top + 2, z) !== AIR) return -1;
  return top;
}

/** Drop the player onto solid ground, never inside a block. Scans outward in
 *  rings from the world origin for the nearest dry, open column. */
function spawnPlayer(): void {
  let sx = 0;
  let sz = 0;
  let top = -1;
  const maxR = 64;
  for (let r = 0; r <= maxR && top < 0; r++) {
    for (let dz = -r; dz <= r && top < 0; dz++) {
      for (let dx = -r; dx <= r && top < 0; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring edge only
        const t = standableTop(dx, dz);
        if (t >= 0) {
          sx = dx;
          sz = dz;
          top = t;
        }
      }
    }
  }
  if (top < 0) top = Math.min(world.heightAt(0, 0), WY - 3); // fallback
  player.x = sx + 0.5;
  player.z = sz + 0.5;
  player.y = top + 1; // feet on top of the ground block
  player.vx = player.vy = player.vz = 0;
  player.yaw = 0;
  player.pitch = -0.15;
}

function loadOrCreate(): void {
  const data = store.load();
  if (data) {
    world = new World(data.seed);
    world.loadEdits(data.edits);
    player.x = data.px;
    player.y = data.py;
    player.z = data.pz;
    player.yaw = data.yaw;
    player.pitch = data.pitch;
    sel = Math.min(data.sel || 0, HOTBAR.length - 1);
  } else {
    world = new World((Math.random() * 0xffffffff) >>> 0);
    spawnPlayer();
  }
  clearChunks();
  primeChunks();
  updateHotbar();
}

let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 700);
}
function persist(): void {
  store.save({
    seed: world.seed,
    edits: world.getEdits(),
    px: player.x,
    py: player.y,
    pz: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    sel,
  });
}

function newWorld(): void {
  world = new World((Math.random() * 0xffffffff) >>> 0);
  spawnPlayer();
  clearChunks();
  primeChunks();
  persist();
}

/* --------------------------------------------------------------- physics */

const HEIGHT = 1.8;
const EYE = 1.62;
const RADIUS = 0.3;
const GRAVITY = -26;
const JUMP_V = 8.6;
const WALK_SPEED = 4.6;
const FLY_SPEED = 9.5;

function collides(x: number, y: number, z: number): boolean {
  const x0 = Math.floor(x - RADIUS);
  const x1 = Math.floor(x + RADIUS);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + HEIGHT - 0.001);
  const z0 = Math.floor(z - RADIUS);
  const z1 = Math.floor(z + RADIUS);
  for (let yy = y0; yy <= y1; yy++) {
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        if (world.isSolidAt(xx, yy, zz)) return true;
      }
    }
  }
  return false;
}

/** Move along one axis in small steps, stopping (and zeroing velocity) on
 *  contact. Returns true if a collision halted the motion. */
function moveAxis(axis: "x" | "y" | "z", delta: number): boolean {
  if (delta === 0) return false;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.2));
  const step = delta / steps;
  for (let i = 0; i < steps; i++) {
    player[axis] += step;
    if (collides(player.x, player.y, player.z)) {
      player[axis] -= step;
      return true;
    }
  }
  return false;
}

function updatePhysics(dt: number): void {
  const f = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
  const r = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  // Forward (flat) = (-sin, 0, -cos); right = (cos, 0, -sin).
  let mx = -sin * f + cos * r;
  let mz = -cos * f - sin * r;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  const speed = player.fly ? FLY_SPEED : WALK_SPEED;
  player.vx = mx * speed;
  player.vz = mz * speed;

  if (player.fly) {
    const up = (keys.jump ? 1 : 0) - (keys.down ? 1 : 0);
    player.vy = up * FLY_SPEED;
  } else {
    player.vy += GRAVITY * dt;
    if (keys.jump && player.onGround) {
      player.vy = JUMP_V;
      player.onGround = false;
    }
  }

  moveAxis("x", player.vx * dt);
  moveAxis("z", player.vz * dt);
  player.onGround = false;
  const hitY = moveAxis("y", player.vy * dt);
  if (hitY) {
    if (player.vy < 0) player.onGround = true;
    player.vy = 0;
  }

  // The world is horizontally unbounded; only catch falls out the bottom.
  if (player.y < -10) spawnPlayer();
}

/* --------------------------------------------------------------- raycast */

interface RayHit {
  hx: number;
  hy: number;
  hz: number;
  px: number;
  py: number;
  pz: number;
}

const REACH = 6;
function raycast(): RayHit | null {
  const ex = player.x;
  const ey = player.y + EYE;
  const ez = player.z;
  const [dx, dy, dz] = mat4.dirFromYawPitch(player.yaw, player.pitch);
  let prev = [Math.floor(ex), Math.floor(ey), Math.floor(ez)];
  for (let t = 0; t <= REACH; t += 0.05) {
    const cx = Math.floor(ex + dx * t);
    const cy = Math.floor(ey + dy * t);
    const cz = Math.floor(ez + dz * t);
    if (cx === prev[0] && cy === prev[1] && cz === prev[2]) continue;
    const b = world.get(cx, cy, cz);
    if (b !== AIR && b !== WATER && isSolid(b)) {
      return { hx: cx, hy: cy, hz: cz, px: prev[0], py: prev[1], pz: prev[2] };
    }
    prev = [cx, cy, cz];
  }
  return null;
}

/** Would a solid block at (x,y,z) overlap the player's body? */
function overlapsPlayer(x: number, y: number, z: number): boolean {
  return (
    x + 1 > player.x - RADIUS &&
    x < player.x + RADIUS &&
    z + 1 > player.z - RADIUS &&
    z < player.z + RADIUS &&
    y + 1 > player.y &&
    y < player.y + HEIGHT
  );
}

function remeshAround(x: number, y: number, z: number): void {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const touched = new Set<string>();
  const mark = (a: number, b: number): void => {
    touched.add(`${a},${b}`);
  };
  mark(cx, cz);
  mark(Math.floor((x - 1) / CHUNK), cz);
  mark(Math.floor((x + 1) / CHUNK), cz);
  mark(cx, Math.floor((z - 1) / CHUNK));
  mark(cx, Math.floor((z + 1) / CHUNK));
  for (const key of touched) {
    const [a, b] = key.split(",").map(Number);
    rebuildChunk(a, b);
  }
}

function mine(): void {
  const hit = raycast();
  if (!hit) return;
  setBlock(hit.hx, hit.hy, hit.hz, AIR);
  remeshAround(hit.hx, hit.hy, hit.hz);
  scheduleSave();
}

function place(): void {
  const hit = raycast();
  if (!hit) return;
  const { px, py, pz } = hit;
  if (!world.inBounds(px, py, pz)) return;
  const target = world.get(px, py, pz);
  if (target !== AIR && target !== WATER) return;
  if (overlapsPlayer(px, py, pz)) return;
  setBlock(px, py, pz, HOTBAR[sel].block);
  remeshAround(px, py, pz);
  scheduleSave();
}

function toggleFly(): void {
  player.fly = !player.fly;
  player.vy = 0;
  const btn = ui.action("fly");
  if (btn) btn.textContent = MG.i18n.t(player.fly ? "walk" : "fly");
}

/* --------------------------------------------------------------- hotbar */

const hotbarEl = $("hotbar");
function buildHotbar(): void {
  hotbarEl.innerHTML = "";
  HOTBAR.forEach((item, i) => {
    const slot = document.createElement("button");
    slot.className = "slot";
    slot.type = "button";
    slot.title = MG.i18n.t(item.nameKey);
    slot.appendChild(tileIcon(atlas, item.icon, 40));
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = String(i + 1);
    slot.appendChild(num);
    slot.addEventListener("click", () => selectSlot(i));
    hotbarEl.appendChild(slot);
  });
}
function updateHotbar(): void {
  Array.from(hotbarEl.children).forEach((el, i) => {
    el.classList.toggle("active", i === sel);
    (el as HTMLElement).title = MG.i18n.t(HOTBAR[i].nameKey);
  });
  ui.setStat("block", MG.i18n.t(HOTBAR[sel].nameKey));
}
function selectSlot(i: number): void {
  sel = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length;
  updateHotbar();
  scheduleSave();
}

/* --------------------------------------------------------------- input */

const keys = {
  fwd: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  down: false,
};

let started = false;
const overlay = $("overlay");

function setKey(code: string, down: boolean): boolean {
  switch (code) {
    case "KeyW":
    case "ArrowUp":
      keys.fwd = down;
      return true;
    case "KeyS":
    case "ArrowDown":
      keys.back = down;
      return true;
    case "KeyA":
    case "ArrowLeft":
      keys.left = down;
      return true;
    case "KeyD":
    case "ArrowRight":
      keys.right = down;
      return true;
    case "Space":
      keys.jump = down;
      return true;
    case "ShiftLeft":
    case "ShiftRight":
      keys.down = down;
      return true;
  }
  return false;
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "KeyF") toggleFly();
  if (e.code.startsWith("Digit")) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
  }
  if (setKey(e.code, true)) e.preventDefault();
});
window.addEventListener("keyup", (e) => {
  if (setKey(e.code, false)) e.preventDefault();
});

// --- Desktop: pointer lock + mouse ---
const hasFinePointer = window.matchMedia("(pointer: fine)").matches;

function startGame(): void {
  started = true;
  overlay.classList.add("hidden");
  if (hasFinePointer) canvas.requestPointerLock();
}

overlay.addEventListener("click", startGame);
canvas.addEventListener("click", () => {
  if (!started) startGame();
  else if (hasFinePointer && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

const MOUSE_SENS = 0.0024;
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * MOUSE_SENS;
  player.pitch = clampPitch(player.pitch - e.movementY * MOUSE_SENS);
});
document.addEventListener("mousedown", (e) => {
  if (document.pointerLockElement !== canvas) return;
  e.preventDefault();
  if (e.button === 0) mine();
  else if (e.button === 2) place();
});
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!started) return;
    e.preventDefault();
    selectSlot(sel + (e.deltaY > 0 ? 1 : -1));
  },
  { passive: false },
);

function clampPitch(p: number): number {
  return Math.max(-1.54, Math.min(1.54, p));
}

// --- Touch: stick (left) + look (canvas) + buttons ---
const LOOK_SENS = 0.006;
let lookId = -1;
let lookX = 0;
let lookY = 0;
const stick = { id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
const stickEl = $("stick");
const knobEl = $("knob");

function stickToKeys(): void {
  const r = 48;
  const fx = Math.max(-1, Math.min(1, stick.dx / r));
  const fy = Math.max(-1, Math.min(1, stick.dy / r));
  keys.fwd = fy < -0.3;
  keys.back = fy > 0.3;
  keys.left = fx < -0.3;
  keys.right = fx > 0.3;
  const kx = Math.max(-r, Math.min(r, stick.dx));
  const ky = Math.max(-r, Math.min(r, stick.dy));
  knobEl.style.transform = `translate(${kx}px, ${ky}px)`;
}

stickEl.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stick.id = t.identifier;
    const rect = stickEl.getBoundingClientRect();
    stick.ox = rect.left + rect.width / 2;
    stick.oy = rect.top + rect.height / 2;
    stick.dx = t.clientX - stick.ox;
    stick.dy = t.clientY - stick.oy;
    stickToKeys();
  },
  { passive: false },
);

window.addEventListener(
  "touchmove",
  (e) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stick.id) {
        stick.dx = t.clientX - stick.ox;
        stick.dy = t.clientY - stick.oy;
        stickToKeys();
      } else if (t.identifier === lookId) {
        player.yaw -= (t.clientX - lookX) * LOOK_SENS;
        player.pitch = clampPitch(player.pitch - (t.clientY - lookY) * LOOK_SENS);
        lookX = t.clientX;
        lookY = t.clientY;
      }
    }
  },
  { passive: false },
);

function endTouch(e: TouchEvent): void {
  for (const t of Array.from(e.changedTouches)) {
    if (t.identifier === stick.id) {
      stick.id = -1;
      stick.dx = stick.dy = 0;
      keys.fwd = keys.back = keys.left = keys.right = false;
      knobEl.style.transform = "translate(0,0)";
    }
    if (t.identifier === lookId) lookId = -1;
  }
}
window.addEventListener("touchend", endTouch);
window.addEventListener("touchcancel", endTouch);

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!started) {
      startGame();
      return;
    }
    if (lookId === -1) {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lookX = t.clientX;
      lookY = t.clientY;
    }
  },
  { passive: false },
);

// Action buttons (jump / mine / place). Mine auto-repeats while held.
function bindButton(el: HTMLElement, onDown: () => void, onUp?: () => void, repeat = 0): void {
  let timer = 0;
  const down = (e: Event): void => {
    e.preventDefault();
    el.classList.add("down");
    onDown();
    if (repeat) timer = window.setInterval(onDown, repeat);
  };
  const up = (e: Event): void => {
    e.preventDefault();
    el.classList.remove("down");
    if (timer) clearInterval(timer);
    timer = 0;
    onUp?.();
  };
  el.addEventListener("touchstart", down, { passive: false });
  el.addEventListener("touchend", up, { passive: false });
  el.addEventListener("touchcancel", up, { passive: false });
}
bindButton(
  $("btn-jump"),
  () => {
    keys.jump = true;
  },
  () => {
    keys.jump = false;
  },
);
bindButton($("btn-mine"), mine, undefined, 280);
bindButton($("btn-place"), place);

/* --------------------------------------------------------------- localize */

function localize(): void {
  updateHotbar();
  const btn = ui.action("fly");
  if (btn) btn.textContent = MG.i18n.t(player.fly ? "walk" : "fly");
  overlayTitle.textContent = MG.i18n.t("start");
  overlayTag.textContent = MG.i18n.t("tagline");
  overlayHint.innerHTML = MG.i18n.t(hasFinePointer ? "hintDesktop" : "hintMobile");
  overlayPlay.textContent = MG.i18n.t("play");
}
const overlayTitle = $("ov-title");
const overlayTag = $("ov-tag");
const overlayHint = $("ov-hint");
const overlayPlay = $("ov-play");
MG.i18n.onChange(localize);

/* --------------------------------------------------------------- render */

const proj = mat4.create();
const view = mat4.create();
const mvp = mat4.create();
// Chunks that pass culling this frame (reused to avoid per-frame allocation).
const drawList: ChunkGL[] = [];

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(stage.clientWidth * dpr);
  const h = Math.round(stage.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  GLc.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

function render(): void {
  resize();
  const aspect = canvas.width / canvas.height || 1;
  mat4.perspective(proj, 1.22, aspect, 0.08, 200);

  const ex = player.x;
  const ey = player.y + EYE;
  const ez = player.z;
  const [dx, dy, dz] = mat4.dirFromYawPitch(player.yaw, player.pitch);
  mat4.lookAt(view, [ex, ey, ez], [ex + dx, ey + dy, ez + dz], [0, 1, 0]);
  mat4.multiply(mvp, proj, view);

  // Tint the sky toward blue when the camera is underwater.
  const underwater = world.get(Math.floor(ex), Math.floor(ey), Math.floor(ez)) === WATER;
  if (underwater) {
    GLc.clearColor(0.16, 0.34, 0.52, 1);
    GLc.uniform3f(uFog, 0.16, 0.34, 0.52);
    GLc.uniform1f(uFar, 26);
  } else {
    GLc.clearColor(SKY[0], SKY[1], SKY[2], 1);
    GLc.uniform3fv(uFog, SKY);
    GLc.uniform1f(uFar, 62);
  }

  GLc.clear(GLc.COLOR_BUFFER_BIT | GLc.DEPTH_BUFFER_BIT);
  GLc.uniformMatrix4fv(uMVP, false, mvp);
  GLc.uniform3f(uEye, ex, ey, ez);

  // Decide which resident chunks to draw this frame: cull anything beyond the
  // view distance or outside the camera frustum, so we only draw what's visible.
  const frustum = mat4.frustumPlanes(mvp);
  drawList.length = 0;
  for (const [key, c] of chunkGL) {
    const x0 = (key >> 16) * CHUNK;
    const z0 = ((key << 16) >> 16) * CHUNK;
    // Horizontal distance from the eye to the chunk centre.
    const dxc = x0 + CHUNK / 2 - ex;
    const dzc = z0 + CHUNK / 2 - ez;
    if (Math.hypot(dxc, dzc) - CHUNK > RENDER_DIST) continue;
    if (!mat4.aabbInFrustum(frustum, x0, 0, z0, x0 + CHUNK, WY, z0 + CHUNK)) continue;
    drawList.push(c);
  }

  // Opaque pass.
  GLc.disable(GLc.BLEND);
  GLc.depthMask(true);
  for (const c of drawList) if (c.opaque) drawMesh(c.opaque);

  // Translucent pass (water / glass): blended, no depth writes.
  GLc.enable(GLc.BLEND);
  GLc.blendFunc(GLc.SRC_ALPHA, GLc.ONE_MINUS_SRC_ALPHA);
  GLc.depthMask(false);
  for (const c of drawList) if (c.trans) drawMesh(c.trans);
  GLc.depthMask(true);
}

/* --------------------------------------------------------------- loop */

let last = 0;
let posAcc = 0;
function loop(now: number): void {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  if (started) updatePhysics(dt);
  manageChunks();
  render();

  posAcc += dt;
  if (posAcc > 0.2) {
    posAcc = 0;
    ui.setStat("pos", `${Math.floor(player.x)}, ${Math.floor(player.y)}, ${Math.floor(player.z)}`);
  }
  requestAnimationFrame(loop);
}

// --- Boot ---
buildHotbar();
loadOrCreate();
localize();
resize();
window.addEventListener("beforeunload", persist);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});
requestAnimationFrame(loop);
