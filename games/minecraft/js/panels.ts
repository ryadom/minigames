/* ==========================================================================
   Inventory + crafting overlay.

   A single full-screen panel that hosts the crafting recipes (the crafting
   table) and the full inventory grid (storage rows + the hotbar row). Items
   are moved by picking up a whole stack onto the cursor and dropping it on
   another slot (swap / merge), which works with both mouse and touch. Crafting
   a recipe consumes its ingredients and adds the result. Everything re-renders
   on change and on a language switch.
   ========================================================================== */

import { MG } from "../../../shared/mg";
import { HOTBAR_SIZE, type Inventory, type Slot } from "./inventory";
import { itemDef } from "./items";
import { canCraft, craft, RECIPES } from "./recipes";
import { tileIcon } from "./textures";

interface PanelDeps {
  inv: Inventory;
  atlas: HTMLCanvasElement;
  onChange: () => void; // refresh hotbar + persist
}

export interface Panels {
  toggle: () => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

/** A 24px item icon with an optional count badge. */
function iconEl(atlas: HTMLCanvasElement, id: string, count: number, size = 34): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mc-icon";
  const def = itemDef(id);
  if (def) {
    const c = tileIcon(atlas, def.icon, size);
    wrap.appendChild(c);
  }
  if (count > 1) {
    const n = document.createElement("span");
    n.className = "mc-count";
    n.textContent = String(count);
    wrap.appendChild(n);
  }
  return wrap;
}

export function createPanels(deps: PanelDeps): Panels {
  const { inv, atlas, onChange } = deps;
  const t = (k: string): string => MG.i18n.t(k) as string;

  // --- Overlay scaffold ---
  const overlay = document.createElement("div");
  overlay.className = "mc-panel-overlay hidden";

  const panel = document.createElement("div");
  panel.className = "mc-panel";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.className = "mc-panel-head";
  const titleEl = document.createElement("div");
  titleEl.className = "mc-panel-title";
  const closeBtn = document.createElement("button");
  closeBtn.className = "mc-panel-close";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const craftHead = document.createElement("div");
  craftHead.className = "mc-sub";
  panel.appendChild(craftHead);
  const craftGrid = document.createElement("div");
  craftGrid.className = "mc-recipes";
  panel.appendChild(craftGrid);

  const invHead = document.createElement("div");
  invHead.className = "mc-sub";
  panel.appendChild(invHead);
  const invGrid = document.createElement("div");
  invGrid.className = "mc-inv-grid";
  panel.appendChild(invGrid);

  document.body.appendChild(overlay);

  // --- Cursor-carried stack ---
  let carried: Slot | null = null;
  const carryEl = document.createElement("div");
  carryEl.className = "mc-carry hidden";
  document.body.appendChild(carryEl);
  let ptrX = 0;
  let ptrY = 0;

  function renderCarry(): void {
    carryEl.innerHTML = "";
    if (!carried) {
      carryEl.classList.add("hidden");
      return;
    }
    carryEl.classList.remove("hidden");
    carryEl.appendChild(iconEl(atlas, carried.id, carried.count, 34));
    carryEl.style.left = `${ptrX}px`;
    carryEl.style.top = `${ptrY}px`;
  }

  function moveCarry(x: number, y: number): void {
    ptrX = x;
    ptrY = y;
    if (carried) {
      carryEl.style.left = `${x}px`;
      carryEl.style.top = `${y}px`;
    }
  }
  document.addEventListener("mousemove", (e) => moveCarry(e.clientX, e.clientY));
  document.addEventListener(
    "touchstart",
    (e) => {
      if (!isOpen()) return;
      const t = e.touches[0];
      if (t) moveCarry(t.clientX, t.clientY);
    },
    { passive: true },
  );

  /** Click handling on an inventory slot: pick up / drop / swap / merge. */
  function slotClick(index: number): void {
    const cur = inv.slots[index];
    if (!carried) {
      if (cur) {
        carried = cur;
        inv.slots[index] = null;
      }
    } else if (!cur) {
      inv.slots[index] = carried;
      carried = null;
    } else if (cur.id === carried.id) {
      const cap = itemDef(cur.id)?.maxStack ?? 64;
      const take = Math.min(cap - cur.count, carried.count);
      cur.count += take;
      carried.count -= take;
      if (carried.count <= 0) carried = null;
    } else {
      inv.slots[index] = carried;
      carried = cur;
    }
    renderCarry();
    renderInv();
    onChange();
  }

  function renderInv(): void {
    invGrid.innerHTML = "";
    inv.slots.forEach((s, i) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = i < HOTBAR_SIZE ? "mc-slot mc-slot-hot" : "mc-slot";
      if (s) cell.appendChild(iconEl(atlas, s.id, s.count, 34));
      cell.addEventListener("click", () => slotClick(i));
      invGrid.appendChild(cell);
    });
  }

  function renderRecipes(): void {
    craftGrid.innerHTML = "";
    for (const r of RECIPES) {
      const row = document.createElement("div");
      row.className = "mc-recipe";

      const out = document.createElement("div");
      out.className = "mc-recipe-out";
      out.appendChild(iconEl(atlas, r.out.id, r.out.count, 30));
      const oname = document.createElement("span");
      oname.className = "mc-recipe-name";
      oname.textContent = t(itemDef(r.out.id)?.nameKey ?? r.out.id);
      out.appendChild(oname);
      row.appendChild(out);

      const ing = document.createElement("div");
      ing.className = "mc-recipe-in";
      for (const i of r.in) {
        const have = inv.countOf(i.id) >= i.count;
        const chip = document.createElement("div");
        chip.className = have ? "mc-ing" : "mc-ing mc-ing-short";
        chip.appendChild(iconEl(atlas, i.id, 0, 22));
        const c = document.createElement("span");
        c.textContent = `${inv.countOf(i.id)}/${i.count}`;
        chip.appendChild(c);
        ing.appendChild(chip);
      }
      row.appendChild(ing);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mc-craft-btn";
      btn.textContent = t("craftDo");
      btn.disabled = !canCraft(inv, r);
      btn.addEventListener("click", () => {
        if (craft(inv, r)) {
          refresh();
          onChange();
        }
      });
      row.appendChild(btn);

      craftGrid.appendChild(row);
    }
  }

  function localize(): void {
    titleEl.textContent = t("invTitle");
    craftHead.textContent = `🛠️ ${t("craftTitle")}`;
    invHead.textContent = `🎒 ${t("invItems")}`;
  }

  function refresh(): void {
    localize();
    renderRecipes();
    renderInv();
  }

  function open(): void {
    refresh();
    overlay.classList.remove("hidden");
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function close(): void {
    // Return any carried stack so items are never lost.
    if (carried) {
      inv.add(carried.id, carried.count);
      carried = null;
      renderCarry();
    }
    overlay.classList.add("hidden");
    onChange();
  }

  function isOpen(): boolean {
    return !overlay.classList.contains("hidden");
  }

  function toggle(): void {
    if (isOpen()) close();
    else open();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  MG.i18n.onChange(() => {
    if (isOpen()) refresh();
  });

  return { toggle, close, isOpen, refresh };
}
