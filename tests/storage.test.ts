/* Tests for the shared versioned save store (MG.storage in shared/mg.ts). */
import { beforeEach, describe, expect, test } from "bun:test";
import { storage } from "../shared/mg";

beforeEach(() => {
  localStorage.clear();
});

describe("storage save / load round trip", () => {
  test("load() is null before anything is saved", () => {
    const s = storage("rt-empty");
    expect(s.load()).toBeNull();
  });

  test("save() then load() returns the same data", () => {
    const s = storage("rt-basic");
    s.save({ best: 7, runs: 3 });
    expect(s.load()).toEqual({ best: 7, runs: 3 });
  });

  test("namespaces its localStorage key as mg.save.<name>", () => {
    const s = storage("rt-key");
    expect(s.key).toBe("mg.save.rt-key");
    s.save({ a: 1 });
    expect(localStorage.getItem("mg.save.rt-key")).not.toBeNull();
  });

  test("wraps the payload in a { v, t, data } envelope", () => {
    const s = storage("rt-envelope", { version: 3 });
    s.save({ hello: "world" });
    const env = JSON.parse(localStorage.getItem("mg.save.rt-envelope") as string);
    expect(env.v).toBe(3);
    expect(typeof env.t).toBe("number");
    expect(env.data).toEqual({ hello: "world" });
  });
});

describe("storage.update", () => {
  test("loads, mutates and re-saves", () => {
    const s = storage<{ best: number }>("up-basic");
    s.update((d) => {
      d = d || { best: 0 };
      d.best = 5;
      return d;
    });
    expect(s.load()).toEqual({ best: 5 });
  });

  test("hands null to the updater when nothing is stored yet", () => {
    const s = storage<{ n: number }>("up-null");
    let seen: unknown = "unset";
    s.update((d) => {
      seen = d;
      return { n: 1 };
    });
    expect(seen).toBeNull();
  });
});

describe("storage.clear", () => {
  test("wipes the save", () => {
    const s = storage("clear-me");
    s.save({ x: 1 });
    s.clear();
    expect(s.load()).toBeNull();
    expect(localStorage.getItem("mg.save.clear-me")).toBeNull();
  });
});

describe("storage migrations", () => {
  test("runs steps from the stored version up to the current one", () => {
    // Simulate an old v0 save written by a legacy build.
    localStorage.setItem(
      "mg.save.mig",
      JSON.stringify({ v: 0, t: Date.now(), data: { high: 42 } }),
    );
    const s = storage("mig", {
      version: 2,
      migrations: {
        1: (d: { high?: number }) => ({ best: d.high || 0 }),
        2: (d: { best: number; runs?: number }) => {
          d.runs = d.runs || 0;
          return d;
        },
      },
    });
    expect(s.load()).toEqual({ best: 42, runs: 0 });
  });

  test("persists the upgraded copy at the current version", () => {
    localStorage.setItem("mg.save.mig2", JSON.stringify({ v: 1, t: 1, data: { a: 1 } }));
    const s = storage("mig2", {
      version: 2,
      migrations: { 2: (d: { a: number }) => ({ a: d.a, b: 2 }) },
    });
    s.load();
    const env = JSON.parse(localStorage.getItem("mg.save.mig2") as string);
    expect(env.v).toBe(2);
    expect(env.data).toEqual({ a: 1, b: 2 });
  });

  test("a save from a newer build is returned as-is (never downgraded)", () => {
    localStorage.setItem(
      "mg.save.future",
      JSON.stringify({ v: 99, t: Date.now(), data: { fancy: true } }),
    );
    const s = storage("future", { version: 2 });
    expect(s.load()).toEqual({ fancy: true });
    // Untouched on disk.
    expect(JSON.parse(localStorage.getItem("mg.save.future") as string).v).toBe(99);
  });

  test("a broken migration step is skipped rather than throwing", () => {
    localStorage.setItem("mg.save.brk", JSON.stringify({ v: 0, t: 1, data: { keep: 1 } }));
    const s = storage("brk", {
      version: 1,
      migrations: {
        1: () => {
          throw new Error("boom");
        },
      },
    });
    expect(() => s.load()).not.toThrow();
  });
});

describe("storage corrupt data", () => {
  test("treats unparseable JSON as no save", () => {
    localStorage.setItem("mg.save.corrupt", "{not json");
    const s = storage("corrupt");
    expect(s.load()).toBeNull();
  });

  test("ignores an envelope that isn't an object", () => {
    localStorage.setItem("mg.save.notobj", JSON.stringify(42));
    const s = storage("notobj");
    expect(s.load()).toBeNull();
  });
});

describe("storage static helpers", () => {
  test("list() summarises every save, most recent first", () => {
    storage("a").save({});
    storage("b").save({});
    const names = storage.list().map((e) => e.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
    const sorted = storage.list();
    for (let i = 1; i < sorted.length; i++) {
      expect((sorted[i - 1].savedAt || 0) >= (sorted[i].savedAt || 0)).toBe(true);
    }
  });

  test("list() ignores non-save keys", () => {
    localStorage.setItem("unrelated", "x");
    storage("only").save({});
    expect(storage.list().every((e) => e.key.startsWith("mg.save."))).toBe(true);
  });

  test("remove() deletes a single save by name", () => {
    storage("gone").save({});
    storage.remove("gone");
    expect(localStorage.getItem("mg.save.gone")).toBeNull();
  });

  test("clearAll() wipes every save", () => {
    storage("x").save({});
    storage("y").save({});
    storage.clearAll();
    expect(storage.list()).toHaveLength(0);
  });
});
