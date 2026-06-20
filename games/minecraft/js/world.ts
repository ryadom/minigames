/* ==========================================================================
   Voxel world: infinite chunk-based terrain generation, edits and meshing.

   The world is unbounded on the horizontal axes and a fixed WY tall. Voxels
   live in 16×16×WY chunks (one byte each) that are generated lazily the first
   time they're touched and cached in a map keyed by chunk coordinate. Terrain
   comes from layered value-noise (a pure function of world x/z, so chunks are
   seamless and deterministic); trees are scattered on grass, and a chunk also
   renders the slices of trees whose trunk sits in a neighbouring chunk so
   canopies cross chunk borders cleanly. Player edits are stored separately and
   re-applied whenever their chunk is (re)generated, so a chunk can be evicted
   from memory and regenerated identically later.

   For drawing, each chunk is meshed into two interleaved vertex buffers —
   opaque and translucent — emitting only exposed faces, with per-vertex
   ambient occlusion and directional face shading baked into a single "light"
   attribute. Editing a block re-meshes just the chunk(s) hit.
   ========================================================================== */

import {
  AIR,
  alphaOf,
  DIRT,
  GRASS,
  isOpaque,
  isSolid,
  isTranslucent,
  LEAVES,
  LOG,
  occludes,
  SAND,
  STONE,
  tileFor,
  WATER,
} from "./blocks";
import { tileUV } from "./textures";

export const CHUNK = 16;
export const WY = 56;
export const SEA = 24;
// How far (in blocks) a tree's trunk can sit outside a chunk and still drop
// canopy leaves into it. Trunk + canopy radius (2) → 3 is comfortably safe.
const TREE_MARGIN = 3;

// 7 floats / vertex: position(3), uv(2), light(1), alpha(1).
export const FLOATS_PER_VERT = 7;

export interface MeshArrays {
  data: Float32Array;
  index: Uint16Array;
  count: number;
}
export interface ChunkMesh {
  opaque: MeshArrays;
  trans: MeshArrays;
}

/** Pack a chunk coordinate into a single signed-int32 map key. Supports chunk
 *  coordinates in [-32768, 32767] (≈ ±524k blocks), far beyond any session. */
export function chunkKey(cx: number, cz: number): number {
  return ((cx & 0xffff) << 16) | (cz & 0xffff);
}
function keyCX(key: number): number {
  return key >> 16; // arithmetic shift sign-extends
}
function keyCZ(key: number): number {
  return (key << 16) >> 16;
}

function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number, freq: number): number {
  const px = x * freq;
  const pz = z * freq;
  const ix = Math.floor(px);
  const iz = Math.floor(pz);
  const fx = smooth(px - ix);
  const fz = smooth(pz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Local voxel index inside a chunk's byte array. */
function localIdx(lx: number, y: number, lz: number): number {
  return (y * CHUNK + lz) * CHUNK + lx;
}

export class World {
  readonly seed: number;
  // Generated chunk voxel data, keyed by chunkKey(cx, cz).
  private chunks = new Map<number, Uint8Array>();
  // Player edits, bucketed by chunk so they apply fast on (re)generation.
  // Inner map: localIdx → block.
  private edits = new Map<number, Map<number, number>>();

  // One-entry cache so the hot path (sequential get/set in one chunk) skips
  // the map lookup. Invalidated whenever a chunk is dropped.
  private cacheKey = 1 << 30; // an impossible key
  private cacheChunk: Uint8Array | null = null;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  /** The chunk's voxel data, generating (and caching) it on first access. */
  private getChunk(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = this.generateChunk(cx, cz);
      this.chunks.set(key, c);
    }
    return c;
  }

  /** Free a chunk's voxel data (edits are kept, so it regenerates identically). */
  dropChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.delete(key)) {
      this.cacheKey = 1 << 30;
      this.cacheChunk = null;
    }
  }

  /** Free every resident chunk farther than `radius` chunks (Chebyshev) from
   *  (pcx, pcz). Bounds memory as the player roams — including the voxel-only
   *  chunks generated as meshing neighbours that never get their own mesh. */
  prune(pcx: number, pcz: number, radius: number): void {
    for (const key of this.chunks.keys()) {
      if (Math.abs(keyCX(key) - pcx) > radius || Math.abs(keyCZ(key) - pcz) > radius) {
        this.chunks.delete(key);
      }
    }
    this.cacheKey = 1 << 30;
    this.cacheChunk = null;
  }

  /** Block at a voxel. Below the world reads as solid stone (so floor faces
   *  are culled); above the top reads as air. */
  get(x: number, y: number, z: number): number {
    if (y < 0) return STONE;
    if (y >= WY) return AIR;
    const cx = x >> 4;
    const cz = z >> 4;
    const key = chunkKey(cx, cz);
    let c = this.cacheChunk;
    if (key !== this.cacheKey || !c) {
      c = this.getChunk(cx, cz);
      this.cacheKey = key;
      this.cacheChunk = c;
    }
    return c[localIdx(x - (cx << 4), y, z - (cz << 4))];
  }

  /** Set a block (used by gameplay edits); records the edit for persistence. */
  set(x: number, y: number, z: number, block: number): void {
    if (y < 0 || y >= WY) return;
    const cx = x >> 4;
    const cz = z >> 4;
    const li = localIdx(x - (cx << 4), y, z - (cz << 4));
    this.getChunk(cx, cz)[li] = block;
    const key = chunkKey(cx, cz);
    let m = this.edits.get(key);
    if (!m) {
      m = new Map();
      this.edits.set(key, m);
    }
    m.set(li, block);
  }

  /** Horizontal axes are unbounded; only the vertical range is finite. */
  inBounds(_x: number, y: number, _z: number): boolean {
    return y >= 0 && y < WY;
  }

  isSolidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.get(x, y, z));
  }

  heightAt(x: number, z: number): number {
    let e = 0;
    let amp = 1;
    let freq = 0.012;
    let sum = 0;
    for (let o = 0; o < 5; o++) {
      e += valueNoise(x, z, this.seed + o * 131, freq) * amp;
      sum += amp;
      amp *= 0.5;
      freq *= 2;
    }
    e /= sum;
    return Math.floor(10 + e ** 1.25 * 34); // ~10..44
  }

  /* --------------------------------------------------------------- edits */

  /** Bulk-load persisted edits before any chunk is generated. */
  loadEdits(list: ReadonlyArray<[number, number, number, number]>): void {
    this.edits.clear();
    for (const [x, y, z, block] of list) {
      if (y < 0 || y >= WY) continue;
      const cx = x >> 4;
      const cz = z >> 4;
      const key = chunkKey(cx, cz);
      let m = this.edits.get(key);
      if (!m) {
        m = new Map();
        this.edits.set(key, m);
      }
      m.set(localIdx(x - (cx << 4), y, z - (cz << 4)), block);
    }
  }

  /** All edits as flat [x, y, z, block] tuples (for saving). */
  getEdits(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const [key, m] of this.edits) {
      const x0 = keyCX(key) << 4;
      const z0 = keyCZ(key) << 4;
      for (const [li, block] of m) {
        const lx = li % CHUNK;
        const lz = Math.floor(li / CHUNK) % CHUNK;
        const y = Math.floor(li / (CHUNK * CHUNK));
        out.push([x0 + lx, y, z0 + lz, block]);
      }
    }
    return out;
  }

  /* ----------------------------------------------------------- generation */

  private generateChunk(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK * WY * CHUNK);
    const x0 = cx << 4;
    const z0 = cz << 4;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const h = this.heightAt(x, z);
        const top = Math.min(h, WY - 1);
        for (let y = 0; y <= top; y++) {
          let b: number;
          if (y < h - 3) b = STONE;
          else if (y < h) b = DIRT;
          else b = h <= SEA ? SAND : GRASS; // top
          if (y >= h - 1 && h <= SEA + 1 && h >= SEA - 2) b = SAND; // beach band
          data[localIdx(lx, y, lz)] = b;
        }
        // Fill oceans/lakes up to sea level.
        for (let y = h + 1; y <= Math.min(SEA, WY - 1); y++) data[localIdx(lx, y, lz)] = WATER;
      }
    }

    this.plantTrees(cx, cz, data);

    // Re-apply any persisted edits that fall in this chunk.
    const m = this.edits.get(chunkKey(cx, cz));
    if (m) for (const [li, block] of m) data[li] = block;

    return data;
  }

  /** Plant trees whose canopy touches this chunk. Trunks may sit in a
   *  neighbouring chunk; we write only the blocks that land inside `data`. */
  private plantTrees(cx: number, cz: number, data: Uint8Array): void {
    const x0 = cx << 4;
    const z0 = cz << 4;
    for (let z = z0 - TREE_MARGIN; z < z0 + CHUNK + TREE_MARGIN; z++) {
      for (let x = x0 - TREE_MARGIN; x < x0 + CHUNK + TREE_MARGIN; x++) {
        if (!this.isTreeOrigin(x, z)) continue;
        this.placeTree(data, x0, z0, x, this.heightAt(x, z) + 1, z);
      }
    }
  }

  /** Is (x, z) the base of a tree? Purely a function of position + seed, with
   *  no voxel reads, so it gives the same answer from any neighbouring chunk. */
  private isTreeOrigin(x: number, z: number): boolean {
    const h = this.heightAt(x, z);
    if (h <= SEA + 1) return false; // not on beaches or underwater (surface is grass)
    if (hash2(x, z, this.seed ^ 0x51ed) > 0.022) return false;
    // Keep trees from clumping.
    if (hash2(x + 1, z, this.seed ^ 0x51ed) < 0.022) return false;
    return true;
  }

  private placeTree(
    data: Uint8Array,
    x0: number,
    z0: number,
    x: number,
    baseY: number,
    z: number,
  ): void {
    const put = (gx: number, gy: number, gz: number, block: number, onlyIfAir: boolean): void => {
      const lx = gx - x0;
      const lz = gz - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || gy < 0 || gy >= WY) return;
      const li = localIdx(lx, gy, lz);
      if (onlyIfAir && data[li] !== AIR) return;
      data[li] = block;
    };

    const trunk = 4 + Math.floor(hash2(x, z, this.seed ^ 0x77) * 3);
    const top = baseY + trunk;
    for (let y = baseY; y < top; y++) put(x, y, z, LOG, false);
    // Leaf canopy: two wide layers, then a small cap.
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < 1) continue; // leave room for trunk
          if (Math.abs(dx) === r && Math.abs(dz) === r && hash2(x + dx, z + dz, dy) < 0.5) continue;
          put(x + dx, top + dy, z + dz, LEAVES, true);
        }
      }
    }
    put(x, top, z, LEAVES, true);
  }

  /* ------------------------------------------------------------------ mesh */

  buildChunkMesh(cx: number, cz: number): ChunkMesh {
    const op: number[] = [];
    const opIdx: number[] = [];
    const tr: number[] = [];
    const trIdx: number[] = [];

    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let y = 0; y < WY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const block = this.get(x, y, z);
          if (block === AIR) continue;
          const translucent = isTranslucent(block);
          const verts = translucent ? tr : op;
          const index = translucent ? trIdx : opIdx;
          this.emitBlock(x, y, z, block, verts, index);
        }
      }
    }

    return {
      opaque: pack(op, opIdx),
      trans: pack(tr, trIdx),
    };
  }

  private emitBlock(
    x: number,
    y: number,
    z: number,
    block: number,
    verts: number[],
    index: number[],
  ): void {
    // axis: 0=x, 1=y, 2=z. For each axis emit the −/+ face when exposed.
    for (let axis = 0; axis < 3; axis++) {
      for (let s = 0; s < 2; s++) {
        const sign = s === 0 ? -1 : 1;
        const nx = x + (axis === 0 ? sign : 0);
        const ny = y + (axis === 1 ? sign : 0);
        const nz = z + (axis === 2 ? sign : 0);
        if (occludes(this.get(nx, ny, nz), block)) continue;
        this.emitFace(x, y, z, block, axis, sign, verts, index);
      }
    }
  }

  private emitFace(
    x: number,
    y: number,
    z: number,
    block: number,
    axis: number,
    sign: number,
    verts: number[],
    index: number[],
  ): void {
    const kind = axis === 1 ? (sign > 0 ? "top" : "bottom") : "side";
    const [u0, v0, u1, v1] = tileUV(tileFor(block, kind));
    const shade = faceShade(axis, sign);
    const transl = isTranslucent(block);
    const alpha = alphaOf(block);

    // The two in-plane axes (b, c) are the axes other than `axis`.
    const b = axis === 0 ? 1 : 0;
    const c = axis === 2 ? 1 : 2;
    const base = verts.length / FLOATS_PER_VERT;

    // Quad corners in (b,c) order: (0,0) (1,0) (1,1) (0,1).
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const [bi, ci] of corners) {
      const pos = [x, y, z];
      pos[axis] += sign > 0 ? 1 : 0;
      pos[b] += bi;
      pos[c] += ci;

      // Ambient occlusion from the three neighbours on the outward side.
      let light = shade;
      if (!transl) {
        const db = bi === 0 ? -1 : 1;
        const dc = ci === 0 ? -1 : 1;
        const s1 = this.opaqueAt(x, y, z, axis, sign, b, db, c, 0);
        const s2 = this.opaqueAt(x, y, z, axis, sign, b, 0, c, dc);
        const co = this.opaqueAt(x, y, z, axis, sign, b, db, c, dc);
        const ao = s1 && s2 ? 0 : 3 - (Number(s1) + Number(s2) + Number(co));
        light *= AO_MUL[ao];
      }

      // UV with the texture's vertical axis aligned to world +Y on side faces.
      let us: number;
      let vs: number;
      if (axis === 1) {
        us = bi;
        vs = ci;
      } else if (axis === 0) {
        us = ci;
        vs = 1 - bi;
      } else {
        us = bi;
        vs = 1 - ci;
      }
      verts.push(pos[0], pos[1], pos[2], u0 + us * (u1 - u0), v0 + vs * (v1 - v0), light, alpha);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Is the AO sample neighbour opaque? Offsets are along the named axes. */
  private opaqueAt(
    x: number,
    y: number,
    z: number,
    axis: number,
    sign: number,
    b: number,
    db: number,
    c: number,
    dc: number,
  ): boolean {
    const p = [x, y, z];
    p[axis] += sign;
    p[b] += db;
    p[c] += dc;
    return isOpaque(this.get(p[0], p[1], p[2]));
  }
}

const AO_MUL = [0.45, 0.62, 0.8, 1.0];

function faceShade(axis: number, sign: number): number {
  if (axis === 1) return sign > 0 ? 1.0 : 0.5; // top / bottom
  if (axis === 0) return 0.72; // east / west
  return 0.62; // north / south
}

function pack(verts: number[], index: number[]): MeshArrays {
  return {
    data: new Float32Array(verts),
    index: new Uint16Array(index),
    count: index.length,
  };
}
