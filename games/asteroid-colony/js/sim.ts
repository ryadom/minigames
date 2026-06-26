/* ============================================================================
 *  Asteroid Colony — the simulation.
 *
 *  A fixed-step accumulator drives a deterministic `step()` so behaviour is
 *  frame-rate independent and offline catch-up reuses the identical code. Each
 *  step: run the field CA, run buildings (power + production), update duplicant
 *  needs, schedule + work errands, move duplicants, then advance morale/cycles.
 * ========================================================================== */
import {
  BASE_FOOD_CAP,
  BELLY_MAX,
  BIRTH_MORALE,
  BREATHE_MIN,
  BUILD_BY_ID,
  BUILD_MS,
  CO2_PER_DUPE,
  COLS,
  CYCLE_MS,
  colOf,
  DUPE_SPEED,
  EAT_AMOUNT,
  HUNGRY_BELOW,
  idx,
  JOB_PRIORITY,
  KCAL_PER_DUPE,
  MAX_DUPES,
  N,
  O2_PER_DUPE,
  OVERHEAT_C,
  OVERHEAT_S,
  RESTED,
  ROWS,
  rowOf,
  STAMINA_DRAIN,
  STAMINA_REST,
  START_TEMP,
  STARVE_S,
  STEP,
  SUFFOCATE_S,
  TILE_BY_ID,
  TIRED,
} from "./config";
import { fieldsStep } from "./fields";
import { cellIndexAt, livingDupes, markDirty, spawnDupe, state } from "./state";
import type { BuildingDef, Duplicant, Job, JobKind, Material, Tile } from "./types";

const STEP_S = STEP / 1000;
let acc = 0;

/** Advance the simulation by `dtMs` real milliseconds (clamped by the caller). */
export function advance(dtMs: number): void {
  acc += dtMs;
  let guard = 0;
  while (acc >= STEP && guard++ < 4000) {
    step(STEP_S);
    acc -= STEP;
  }
  if (guard > 0) markDirty();
}

function step(dt: number): void {
  fieldsStep(dt);
  buildingsStep(dt);
  dupesStep(dt);
  scheduleStep(dt);
  moveStep(dt);
  cycleStep(dt);
}

// --- materials -------------------------------------------------------------
function hasInput(def: BuildingDef, dt: number): boolean {
  if (!def.input) return true;
  for (const m in def.input) {
    const need = (def.input[m as Material] as number) * dt;
    if (state.stock[m as Material] < need) return false;
  }
  return true;
}
function consumeInput(def: BuildingDef, dt: number): void {
  if (!def.input) return;
  for (const m in def.input) {
    state.stock[m as Material] -= (def.input[m as Material] as number) * dt;
  }
}

// --- buildings: power, production, storage caps -----------------------------
function buildingsStep(dt: number): void {
  let foodCap = BASE_FOOD_CAP;
  let batCap = 0;
  let genJoules = 0;
  const consumers: { t: Tile; def: BuildingDef }[] = [];

  for (let i = 0; i < N; i++) {
    const t = state.grid[i];
    if (!t.build) continue;
    const def = BUILD_BY_ID[t.build];
    t.on = false;
    if (def.foodStore) foodCap += def.foodStore;
    if (def.batteryCap) batCap += def.batteryCap;

    if (def.power > 0) {
      // Generator: runs only with fuel; produces power + heat.
      if (hasInput(def, dt)) {
        consumeInput(def, dt);
        genJoules += def.power * dt;
        if (def.heat) t.temp += def.heat * dt;
        t.on = true;
      }
    } else if (def.power < 0) {
      consumers.push({ t, def });
    } else {
      // Passive buildings (mealwood, cooler, ration box, bed, battery).
      applyPassive(t, def, dt, foodCap);
      t.on = true;
    }
  }

  state.foodCap = foodCap;
  state.batteryCap = batCap;
  state.battery = Math.min(state.battery, batCap);

  // Distribute power: production + stored battery, survival machines first.
  consumers.sort((a, b) => (a.def.o2 ? -1 : 0) - (b.def.o2 ? -1 : 0));
  let avail = genJoules + state.battery;
  let consumed = 0;
  for (const c of consumers) {
    const need = -c.def.power * dt;
    if (avail >= need && hasInput(c.def, dt)) {
      avail -= need;
      consumed += need;
      consumeInput(c.def, dt);
      applyActive(c.t, c.def, dt);
      c.t.on = true;
    }
  }
  state.battery = Math.max(0, Math.min(batCap, avail));
  state.power = Math.round((genJoules - consumed) / dt);
  state.food = Math.min(state.food, state.foodCap);
}

function applyActive(t: Tile, def: BuildingDef, dt: number): void {
  if (def.o2) t.o2 += def.o2 * dt;
  if (def.co2) t.co2 = Math.max(0, t.co2 + def.co2 * dt);
  if (def.heat) t.temp += def.heat * dt;
}

function applyPassive(t: Tile, def: BuildingDef, dt: number, foodCap: number): void {
  if (def.heat) t.temp += def.heat * dt; // cooler
  if (def.food) {
    const ok = def.tempMax == null || t.temp <= def.tempMax;
    if (ok) state.food = Math.min(foodCap, state.food + def.food * dt);
  }
}

// --- duplicant needs & death -----------------------------------------------
function dupesStep(dt: number): void {
  for (const d of state.dupes) {
    if (!d.alive) continue;
    const cell = state.grid[cellIndexAt(d.cx, d.cy)];

    if (cell.o2 >= BREATHE_MIN) {
      cell.o2 = Math.max(0, cell.o2 - O2_PER_DUPE * dt);
      cell.co2 += CO2_PER_DUPE * dt;
      d.o2Debt = 0;
    } else {
      d.o2Debt += dt;
    }

    d.belly -= KCAL_PER_DUPE * dt;
    if (d.belly <= 0) {
      d.belly = 0;
      d.foodDebt += dt;
    } else {
      d.foodDebt = 0;
    }

    if (cell.temp > OVERHEAT_C) d.heatDebt += dt;
    else d.heatDebt = Math.max(0, d.heatDebt - dt);

    const sleeping = d.job?.kind === "sleep";
    if (!sleeping) d.stamina = Math.max(0, d.stamina - STAMINA_DRAIN * dt);

    if (d.o2Debt >= SUFFOCATE_S || d.foodDebt >= STARVE_S || d.heatDebt >= OVERHEAT_S) {
      d.alive = false;
      d.job = null;
      state.deaths++;
      markDirty();
    }
  }
}

// --- task scheduling: build the queue, assign idle dupes, do the work -------
const REACH: Record<JobKind, number> = { dig: 1.4, build: 1.0, sleep: 0.7, eat: 0.7 };

function cellOpen(i: number): boolean {
  return state.grid[i].solid === null;
}

// Nearest cell to a dupe matching `match`, not already claimed this step.
function nearestCell(
  d: Duplicant,
  claimed: Set<number>,
  match: (t: Tile, i: number) => boolean,
): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < N; i++) {
    if (claimed.has(i)) continue;
    const t = state.grid[i];
    if (!match(t, i)) continue;
    const dc = colOf(i) + 0.5 - d.cx;
    const dr = rowOf(i) + 0.5 - d.cy;
    const dist = dc * dc + dr * dr;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function jobValid(d: Duplicant): boolean {
  const j = d.job;
  if (!j) return false;
  const t = state.grid[j.cell];
  if (j.kind === "dig") return !!t.marked && t.solid !== null;
  if (j.kind === "build") return !!t.blueprint;
  if (j.kind === "sleep") return d.stamina < RESTED;
  if (j.kind === "eat") return d.belly < BELLY_MAX - 1 && (state.food > 0 || false);
  return false;
}

function setJob(d: Duplicant, kind: JobKind, cell: number, claimed: Set<number>): void {
  d.job = { kind, cell, claimedBy: null };
  claimed.add(cell);
  d.tx = colOf(cell) + 0.5;
  d.ty = rowOf(cell) + 0.5;
}

function scheduleStep(dt: number): void {
  const claimed = new Set<number>();
  // Keep cells of still-valid jobs reserved so others don't poach them.
  for (const d of state.dupes) {
    if (!d.alive) continue;
    if (d.job && jobValid(d)) claimed.add(d.job.cell);
    else d.job = null;
  }

  for (let di = 0; di < state.dupes.length; di++) {
    const d = state.dupes[di];
    if (!d.alive) continue;

    // Personal errands can pre-empt a lower-priority work job.
    const wantEat = d.belly < BELLY_MAX * HUNGRY_BELOW && state.food > 0;
    const wantSleep = d.stamina < TIRED;
    const cur = d.job ? JOB_PRIORITY[d.job.kind] : 0;
    if (wantEat && cur < JOB_PRIORITY.eat) d.job = null;
    else if (wantSleep && !wantEat && cur < JOB_PRIORITY.sleep) d.job = null;

    if (!d.job) assignJob(d, claimed, wantEat, wantSleep);
    if (d.job) workJob(d, dt, claimed);
  }
}

function assignJob(d: Duplicant, claimed: Set<number>, wantEat: boolean, wantSleep: boolean): void {
  if (wantEat) {
    const box = nearestCell(d, claimed, (t) => t.build === "rationBox");
    // No ration box but the supply pod has food — eat where you stand.
    setJob(d, "eat", box >= 0 ? box : cellIndexAt(d.cx, d.cy), claimed);
    return;
  }
  if (wantSleep) {
    const bed = nearestCell(d, claimed, (t) => t.build === "bed");
    setJob(d, "sleep", bed >= 0 ? bed : cellIndexAt(d.cx, d.cy), claimed);
    return;
  }
  // Colony work: build blueprints first, then dig.
  const bp = nearestCell(d, claimed, (t) => !!t.blueprint);
  if (bp >= 0) {
    setJob(d, "build", bp, claimed);
    return;
  }
  const dig = nearestCell(d, claimed, (t, i) => !!t.marked && t.solid !== null && digReachable(i));
  if (dig >= 0) setJob(d, "dig", dig, claimed);
}

// A dig is only worth assigning if a dupe could stand next to it (open neighbour).
function digReachable(i: number): boolean {
  const c = colOf(i);
  const r = rowOf(i);
  return (
    (c > 0 && cellOpen(idx(c - 1, r))) ||
    (c < COLS - 1 && cellOpen(idx(c + 1, r))) ||
    (r > 0 && cellOpen(idx(c, r - 1))) ||
    (r < ROWS - 1 && cellOpen(idx(c, r + 1)))
  );
}

function atJob(d: Duplicant, j: Job): boolean {
  const cc = colOf(j.cell) + 0.5;
  const cr = rowOf(j.cell) + 0.5;
  const dist = Math.hypot(cc - d.cx, cr - d.cy);
  return dist <= REACH[j.kind];
}

function workJob(d: Duplicant, dt: number, claimed: Set<number>): void {
  const j = d.job;
  if (!j) return;
  if (!atJob(d, j)) return; // still walking — handled by moveStep
  const t = state.grid[j.cell];

  if (j.kind === "dig") {
    const def = TILE_BY_ID[t.solid as string];
    t.digProgress = (t.digProgress || 0) + dt * 1000;
    if (t.digProgress >= def.hardness) finishDig(j.cell);
    d.job = digJobDone(t) ? null : d.job;
  } else if (j.kind === "build") {
    const def = BUILD_BY_ID[t.blueprint as string];
    if (!t.buildProgress) {
      // Pay the materials once, when construction actually starts.
      if (!affordBuild(def)) {
        d.job = null;
        claimed.delete(j.cell);
        return;
      }
      payBuild(def);
    }
    t.buildProgress = (t.buildProgress || 0) + dt * 1000;
    if (t.buildProgress >= BUILD_MS) {
      t.build = t.blueprint;
      t.blueprint = null;
      t.buildProgress = 0;
      t.on = false;
      markDirty();
      d.job = null;
    }
  } else if (j.kind === "sleep") {
    const inBed = t.build === "bed";
    d.stamina = Math.min(1, d.stamina + STAMINA_REST * (inBed ? 1 : 0.5) * dt);
    if (d.stamina >= RESTED) d.job = null;
  } else if (j.kind === "eat") {
    const take = Math.min(EAT_AMOUNT, state.food, BELLY_MAX - d.belly);
    if (take > 0) {
      state.food -= take;
      d.belly += take;
    }
    d.job = null;
  }
}

function digJobDone(t: Tile): boolean {
  return t.solid === null;
}

function affordBuild(def: BuildingDef): boolean {
  for (const m in def.cost) {
    if (state.stock[m as Material] < (def.cost[m as Material] as number)) return false;
  }
  return true;
}
function payBuild(def: BuildingDef): void {
  for (const m in def.cost) {
    state.stock[m as Material] -= def.cost[m as Material] as number;
  }
}

function finishDig(i: number): void {
  const t = state.grid[i];
  const def = TILE_BY_ID[t.solid as string];
  for (const m in def.yields) {
    state.stock[m as Material] += def.yields[m as Material] as number;
  }
  const water = def.releasesWater || 0;
  t.solid = null;
  t.marked = false;
  t.digProgress = 0;
  t.o2 = 0;
  t.co2 = 0;
  t.water = water;
  t.temp = START_TEMP;
  markDirty();
}

// --- movement: straight-line walk toward the job (no pathfinding) -----------
function moveStep(dt: number): void {
  for (const d of state.dupes) {
    if (!d.alive) continue;
    if (!d.job) {
      // Idle: drift gently back toward the colony centre.
      d.tx = 18.5;
      d.ty = 6.5;
    }
    const reach = d.job ? REACH[d.job.kind] : 0.4;
    const dx = d.tx - d.cx;
    const dy = d.ty - d.cy;
    const dist = Math.hypot(dx, dy);
    if (dist <= reach) continue;
    const stepLen = Math.min(dist - reach * 0.5, DUPE_SPEED * dt);
    d.cx += (dx / dist) * stepLen;
    d.cy += (dy / dist) * stepLen;
  }
}

// --- morale & cycles -------------------------------------------------------
function cycleStep(dt: number): void {
  let distress = false;
  for (const d of state.dupes) {
    if (d.alive && (d.o2Debt > 0 || d.foodDebt > 0 || d.heatDebt > 0)) {
      distress = true;
      break;
    }
  }
  const target = distress ? 15 : 82;
  state.morale += (target - state.morale) * Math.min(1, dt * 0.08);

  state.cycleMs += dt * 1000;
  if (state.cycleMs >= CYCLE_MS) {
    state.cycleMs -= CYCLE_MS;
    state.cycle++;
    if (state.cycle > state.best) state.best = state.cycle;
    if (livingDupes() < MAX_DUPES && state.morale >= BIRTH_MORALE && !distress) {
      spawnDupe();
    }
    markDirty();
  }
}
