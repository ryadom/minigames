/* ==========================================================================
   Voxel world: terrain generation, edits, and per-chunk mesh building.

   The world is a fixed box of voxels (one byte each). Terrain comes from
   layered value-noise; trees are scattered on grass. For drawing it is split
   into 16×16 chunks (full height); each chunk is meshed into two interleaved
   vertex buffers — opaque and translucent — emitting only exposed faces, with
   per-vertex ambient occlusion and directional face shading baked into a
   single "light" attribute. Editing a block re-meshes just the chunk(s) hit.
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
export const WX = 80;
export const WZ = 80;
export const WY = 56;
export const SEA = 24;
export const CHUNKS_X = WX / CHUNK;
export const CHUNKS_Z = WZ / CHUNK;

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

export class World {
  readonly data: Uint8Array;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.data = new Uint8Array(WX * WY * WZ);
    this.generate();
  }

  private idx(x: number, y: number, z: number): number {
    return (y * WZ + z) * WX + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WX && y >= 0 && y < WY && z >= 0 && z < WZ;
  }

  /** Block at a voxel. Below the world reads as solid stone (so floor faces
   *  are culled); outside the horizontal/top bounds reads as air. */
  get(x: number, y: number, z: number): number {
    if (y < 0) return STONE;
    if (x < 0 || x >= WX || z < 0 || z >= WZ || y >= WY) return AIR;
    return this.data[this.idx(x, y, z)];
  }

  set(x: number, y: number, z: number, block: number): void {
    if (this.inBounds(x, y, z)) this.data[this.idx(x, y, z)] = block;
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

  private generate(): void {
    for (let z = 0; z < WZ; z++) {
      for (let x = 0; x < WX; x++) {
        const h = this.heightAt(x, z);
        for (let y = 0; y <= h; y++) {
          let b: number;
          if (y < h - 3) b = STONE;
          else if (y < h) b = DIRT;
          else b = h <= SEA ? SAND : GRASS; // top
          if (y >= h - 1 && h <= SEA + 1 && h >= SEA - 2) b = SAND; // beach band
          this.set(x, y, z, b);
        }
        // Fill oceans/lakes up to sea level.
        for (let y = h + 1; y <= SEA; y++) this.set(x, y, z, WATER);
      }
    }
    this.plantTrees();
  }

  private plantTrees(): void {
    for (let z = 2; z < WZ - 2; z++) {
      for (let x = 2; x < WX - 2; x++) {
        const h = this.heightAt(x, z);
        if (h <= SEA + 1) continue; // not on beaches or underwater
        if (this.get(x, h, z) !== GRASS) continue;
        if (hash2(x, z, this.seed ^ 0x51ed) > 0.022) continue;
        // Keep trees from clumping.
        if (hash2(x + 1, z, this.seed ^ 0x51ed) < 0.022) continue;
        this.placeTree(x, h + 1, z);
      }
    }
  }

  private placeTree(x: number, baseY: number, z: number): void {
    const trunk = 4 + Math.floor(hash2(x, z, this.seed ^ 0x77) * 3);
    const top = baseY + trunk;
    for (let y = baseY; y < top; y++) this.set(x, y, z, LOG);
    // Leaf canopy: two wide layers, then a small cap.
    for (let dy = -2; dy <= 1; dy++) {
      const r = dy >= 0 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx === 0 && dz === 0 && dy < 1) continue; // leave room for trunk
          if (Math.abs(dx) === r && Math.abs(dz) === r && hash2(x + dx, z + dz, dy) < 0.5) continue;
          const yy = top + dy;
          if (this.get(x + dx, yy, z + dz) === AIR) this.set(x + dx, yy, z + dz, LEAVES);
        }
      }
    }
    this.set(x, top, z, LEAVES);
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
