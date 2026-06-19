/* Tests for the shared i18n control (MG.i18n in shared/mg.ts). */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { i18n } from "../shared/mg";

// i18n is a site-wide singleton; reset to a known language before each test.
beforeEach(() => {
  localStorage.clear();
  i18n.set("en");
});

describe("i18n.SUPPORTED", () => {
  test("offers English, Russian and Spanish", () => {
    expect([...i18n.SUPPORTED].sort()).toEqual(["en", "es", "ru"]);
  });
});

describe("i18n.register / t", () => {
  test("translates a registered key in the current language", () => {
    i18n.register({ en: { greet: "Hello" }, ru: { greet: "Привет" }, es: { greet: "Hola" } });
    expect(i18n.t<string>("greet")).toBe("Hello");
    i18n.set("ru");
    expect(i18n.t<string>("greet")).toBe("Привет");
    i18n.set("es");
    expect(i18n.t<string>("greet")).toBe("Hola");
  });

  test("falls back to English when a language lacks the key", () => {
    i18n.register({ en: { onlyEn: "EN value" } });
    i18n.set("ru");
    expect(i18n.t<string>("onlyEn")).toBe("EN value");
  });

  test("falls back to the key itself when nothing is registered", () => {
    expect(i18n.t<string>("totally.unknown.key")).toBe("totally.unknown.key");
  });

  test("returns non-string values intact (e.g. arrays)", () => {
    i18n.register({ en: { tips: ["a", "b", "c"] } });
    expect(i18n.t<string[]>("tips")).toEqual(["a", "b", "c"]);
  });

  test("later registrations merge over earlier ones", () => {
    i18n.register({ en: { merged: "first" } });
    i18n.register({ en: { merged: "second" } });
    expect(i18n.t<string>("merged")).toBe("second");
  });
});

describe("i18n.set / lang", () => {
  test("changes the current language", () => {
    i18n.set("es");
    expect(i18n.lang).toBe("es");
  });

  test("persists the choice to localStorage", () => {
    i18n.set("ru");
    expect(localStorage.getItem("mg.lang")).toBe("ru");
  });

  test("ignores unsupported languages", () => {
    i18n.set("es");
    i18n.set("de");
    expect(i18n.lang).toBe("es");
  });
});

describe("i18n.onChange", () => {
  let off: (() => void) | null = null;
  afterEach(() => {
    off?.();
    off = null;
  });

  test("notifies subscribers when the language changes", () => {
    const seen: string[] = [];
    off = i18n.onChange((lng) => seen.push(lng));
    i18n.set("ru");
    i18n.set("es");
    expect(seen).toEqual(["ru", "es"]);
  });

  test("does not fire when setting the same language", () => {
    let calls = 0;
    off = i18n.onChange(() => calls++);
    i18n.set("en"); // already en from beforeEach
    expect(calls).toBe(0);
  });

  test("returns an unsubscribe function", () => {
    let calls = 0;
    const unsub = i18n.onChange(() => calls++);
    unsub();
    i18n.set("ru");
    expect(calls).toBe(0);
  });
});
