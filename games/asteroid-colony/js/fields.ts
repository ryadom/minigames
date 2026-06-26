/* ============================================================================
 *  Asteroid Colony — field cellular automata.
 *
 *  Three cheap CA passes over the grid each sim step, giving the ONI feel of
 *  oxygen spreading through dug space, water falling and pooling, and heat
 *  conducting outward. Gas and heat use a double buffer so the diffusion is
 *  order-independent; water is resolved in place (falling-sand style).
 * ========================================================================== */
import {
  CELL_WATER_CAP,
  COLS,
  GAS_DIFFUSE,
  HEAT_DIFFUSE,
  idx,
  N,
  ROWS,
  SPACE_ROWS,
  SPACE_TEMP,
} from "./config";
import { state } from "./state";

// Scratch buffers reused every step (no per-step allocation).
const o2Buf = new Float64Array(N);
const co2Buf = new Float64Array(N);
const tempBuf = new Float64Array(N);

export function fieldsStep(dt: number): void {
  gasStep();
  liquidStep();
  heatStep(dt);
}

// --- gases: O2 + CO2 diffuse through open cells -----------------------------
function gasStep(): void {
  const g = state.grid;
  for (let i = 0; i < N; i++) {
    o2Buf[i] = g[i].o2;
    co2Buf[i] = g[i].co2;
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      const t = g[i];
      if (t.solid !== null) continue;
      // Open cells fully flooded with water hold no gas.
      if (t.water >= CELL_WATER_CAP) continue;
      shareGas(r, i, c, r - 1); // up — O2 rises a touch
      shareGas(r, i, c, r + 1); // down — CO2 sinks a touch
      shareGas(r, i, c - 1, r);
      shareGas(r, i, c + 1, r);
    }
  }
  for (let i = 0; i < N; i++) {
    g[i].o2 = o2Buf[i];
    g[i].co2 = co2Buf[i];
  }
}

function shareGas(r: number, i: number, nc: number, nr: number): void {
  if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
  const g = state.grid;
  const j = idx(nc, nr);
  const nt = g[j];
  if (nt.solid !== null || nt.water >= CELL_WATER_CAP) return;
  // O2 favours moving up, CO2 favours moving down (heavier gas sinks).
  const up = nr < r;
  const down = nr > r;
  const o2Bias = up ? 1.15 : down ? 0.85 : 1;
  const co2Bias = down ? 1.15 : up ? 0.85 : 1;
  const o2Flow = (state.grid[i].o2 - state.grid[j].o2) * GAS_DIFFUSE * 0.5 * o2Bias;
  const co2Flow = (state.grid[i].co2 - state.grid[j].co2) * GAS_DIFFUSE * 0.5 * co2Bias;
  o2Buf[i] -= o2Flow;
  o2Buf[j] += o2Flow;
  co2Buf[i] -= co2Flow;
  co2Buf[j] += co2Flow;
}

// --- liquids: water falls then spreads sideways -----------------------------
function liquidStep(): void {
  const g = state.grid;
  // Bottom-up so water settles in one pass.
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      const t = g[i];
      if (t.solid !== null || t.water <= 0) continue;
      // Fall into the open cell below.
      if (r + 1 < ROWS) {
        const below = g[idx(c, r + 1)];
        if (below.solid === null) {
          const room = CELL_WATER_CAP - below.water;
          if (room > 0) {
            const moved = Math.min(t.water, room);
            below.water += moved;
            t.water -= moved;
            if (t.water <= 0) continue;
          }
        }
      }
      // Spread sideways toward lower neighbours to level out.
      spreadWater(i, c - 1, r);
      spreadWater(i, c + 1, r);
    }
  }
}

function spreadWater(i: number, nc: number, nr: number): void {
  if (nc < 0 || nc >= COLS) return;
  const g = state.grid;
  const t = g[i];
  const nt = g[idx(nc, nr)];
  if (nt.solid !== null) return;
  const diff = t.water - nt.water;
  if (diff <= 0) return;
  const moved = Math.min(diff * 0.25, CELL_WATER_CAP - nt.water);
  if (moved <= 0) return;
  nt.water += moved;
  t.water -= moved;
}

// --- temperature: conduction, with the vacuum rows as a cold sink ----------
function heatStep(dt: number): void {
  const g = state.grid;
  for (let i = 0; i < N; i++) tempBuf[i] = g[i].temp;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      conductHeat(i, c, r - 1);
      conductHeat(i, c, r + 1);
      conductHeat(i, c - 1, r);
      conductHeat(i, c + 1, r);
    }
  }
  for (let i = 0; i < N; i++) g[i].temp = tempBuf[i];
  // Clamp the top vacuum rows to act as a heat sink (radiates to space).
  for (let r = 0; r < SPACE_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      g[i].temp += (SPACE_TEMP - g[i].temp) * Math.min(1, dt * 0.5);
    }
  }
}

function conductHeat(i: number, nc: number, nr: number): void {
  if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return;
  const g = state.grid;
  const j = idx(nc, nr);
  // Solids conduct slower than open air.
  const k = g[i].solid !== null || g[j].solid !== null ? 0.45 : 1;
  const flow = (g[i].temp - g[j].temp) * HEAT_DIFFUSE * 0.5 * k;
  tempBuf[i] -= flow;
  tempBuf[j] += flow;
}
