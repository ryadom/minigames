/* ==========================================================================
   Inventory model.

   A flat list of slots; each slot is either empty (null) or a stack of one
   item id with a count. The first HOTBAR_SIZE slots double as the on-screen
   hotbar. Adding items fills existing matching stacks first, then empty slots,
   respecting each item's max stack size. The whole thing serialises to a plain
   array so it rides along in the shared save store.
   ========================================================================== */

import { itemDef } from "./items";

export const HOTBAR_SIZE = 9;
export const INV_SIZE = 36; // 9 hotbar + 27 storage (4 rows of 9)

export interface Slot {
  id: string;
  count: number;
}

export type SerializedSlot = [string, number] | null;

export class Inventory {
  slots: (Slot | null)[] = new Array(INV_SIZE).fill(null);

  private maxStack(id: string): number {
    return itemDef(id)?.maxStack ?? 64;
  }

  /** Add `count` of an item, stacking where possible. Returns the leftover
   *  that didn't fit (0 when everything was stored). */
  add(id: string, count: number): number {
    const cap = this.maxStack(id);
    // Top up existing stacks first.
    for (const s of this.slots) {
      if (count <= 0) break;
      if (s && s.id === id && s.count < cap) {
        const room = cap - s.count;
        const take = Math.min(room, count);
        s.count += take;
        count -= take;
      }
    }
    // Then spill into empty slots.
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(cap, count);
        this.slots[i] = { id, count: take };
        count -= take;
      }
    }
    return count;
  }

  /** Total count of an item across all slots. */
  countOf(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Remove up to `count` of an item; returns true if all were removed. */
  remove(id: string, count: number): boolean {
    if (this.countOf(id) < count) return false;
    for (const s of this.slots) {
      if (count <= 0) break;
      if (s && s.id === id) {
        const take = Math.min(s.count, count);
        s.count -= take;
        count -= take;
        if (s.count <= 0) this.clearStack(s);
      }
    }
    this.compactNulls();
    return true;
  }

  /** Remove one item from a specific slot (used after placing a block). */
  decAt(index: number): void {
    const s = this.slots[index];
    if (!s) return;
    s.count -= 1;
    if (s.count <= 0) this.slots[index] = null;
  }

  private clearStack(target: Slot): void {
    const i = this.slots.indexOf(target);
    if (i >= 0) this.slots[i] = null;
  }

  private compactNulls(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s && s.count <= 0) this.slots[i] = null;
    }
  }

  serialize(): SerializedSlot[] {
    return this.slots.map((s) => (s ? [s.id, s.count] : null));
  }

  load(data: SerializedSlot[] | undefined): void {
    this.slots = new Array(INV_SIZE).fill(null);
    if (!data) return;
    for (let i = 0; i < Math.min(data.length, INV_SIZE); i++) {
      const e = data[i];
      if (e && itemDef(e[0]) && e[1] > 0) this.slots[i] = { id: e[0], count: e[1] };
    }
  }
}
