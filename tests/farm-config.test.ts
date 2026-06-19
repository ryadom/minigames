/* Tests for the Farm content tables & grid geometry (games/farm/js/config.ts). */
import { describe, expect, test } from "bun:test";
import {
  ANIMAL_BY_ID,
  ANIMAL_FOR_PROD,
  ANIMALS,
  BUILD_BY_ID,
  BUILDS,
  CROP_BY_ID,
  CROPS,
  DISH_BY_ID,
  DISHES,
  esc,
  FLOWER_BY_ID,
  FLOWERS,
  footprintCells,
  GRID_COLS,
  GRID_N,
  GRID_ROWS,
  ITEM,
  inBounds,
  PRODUCTS,
} from "../games/farm/js/config";

const uniqueIds = (rows: { id: string }[]) => new Set(rows.map((r) => r.id)).size === rows.length;

describe("content tables have unique ids", () => {
  test("crops, flowers, products, animals, dishes and builds", () => {
    expect(uniqueIds(CROPS)).toBe(true);
    expect(uniqueIds(FLOWERS)).toBe(true);
    expect(uniqueIds(PRODUCTS)).toBe(true);
    expect(uniqueIds(ANIMALS)).toBe(true);
    expect(uniqueIds(DISHES)).toBe(true);
    expect(uniqueIds(BUILDS)).toBe(true);
  });
});

describe("ITEM master table", () => {
  test("includes every crop, flower, product and dish", () => {
    const total = CROPS.length + FLOWERS.length + PRODUCTS.length + DISHES.length;
    expect(Object.keys(ITEM)).toHaveLength(total);
    for (const c of CROPS) expect(ITEM[c.id]?.kind).toBe("crop");
    for (const f of FLOWERS) expect(ITEM[f.id]?.kind).toBe("flower");
    for (const p of PRODUCTS) expect(ITEM[p.id]?.kind).toBe("product");
    for (const d of DISHES) expect(ITEM[d.id]?.kind).toBe("dish");
  });

  test("carries the table's sell price and icon", () => {
    expect(ITEM.wheat.sell).toBe(5);
    expect(ITEM.wheat.ico).toBe("🌾");
  });
});

describe("lookup maps are consistent", () => {
  test("by-id maps point back at the right row", () => {
    for (const c of CROPS) expect(CROP_BY_ID[c.id]).toBe(c);
    for (const f of FLOWERS) expect(FLOWER_BY_ID[f.id]).toBe(f);
    for (const a of ANIMALS) expect(ANIMAL_BY_ID[a.id]).toBe(a);
    for (const d of DISHES) expect(DISH_BY_ID[d.id]).toBe(d);
    for (const b of BUILDS) expect(BUILD_BY_ID[b.id]).toBe(b);
  });

  test("ANIMAL_FOR_PROD maps a product back to the animal that makes it", () => {
    for (const a of ANIMALS) expect(ANIMAL_FOR_PROD[a.prod]).toBe(a);
    expect(ANIMAL_FOR_PROD.egg.id).toBe("chicken");
  });
});

describe("dish recipes & animal feeds reference real items", () => {
  test("every recipe ingredient exists in ITEM", () => {
    for (const d of DISHES) {
      for (const ing of Object.keys(d.recipe)) {
        expect(ITEM[ing]).toBeDefined();
        expect(d.recipe[ing]).toBeGreaterThan(0);
      }
    }
  });

  test("every animal feeds on and produces a known item", () => {
    for (const a of ANIMALS) {
      expect(CROP_BY_ID[a.feed]).toBeDefined();
      expect(ITEM[a.prod]).toBeDefined();
    }
  });
});

describe("grid geometry", () => {
  test("GRID_N is the cell count", () => {
    expect(GRID_N).toBe(GRID_COLS * GRID_ROWS);
  });

  test("footprintCells lists every cell of a w×h rectangle", () => {
    expect(footprintCells(0, 2, 2)).toEqual([0, 1, GRID_COLS, GRID_COLS + 1]);
    expect(footprintCells(0, 1, 1)).toEqual([0]);
    expect(footprintCells(0, 3, 1)).toEqual([0, 1, 2]);
  });

  test("inBounds rejects footprints that spill off the grid", () => {
    expect(inBounds(0, GRID_COLS, 1)).toBe(true);
    expect(inBounds(GRID_COLS - 1, 2, 1)).toBe(false); // last column, 2 wide
    expect(inBounds((GRID_ROWS - 1) * GRID_COLS, 1, 2)).toBe(false); // last row, 2 tall
    expect(inBounds(0, GRID_COLS, GRID_ROWS)).toBe(true); // exactly fills the grid
  });
});

describe("esc", () => {
  test("escapes HTML metacharacters", () => {
    expect(esc("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(esc(42)).toBe("42");
  });
});
