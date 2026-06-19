/* Tests for the shared header bar (MG.mountHeader in shared/mg.ts). */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { i18n, mountHeader } from "../shared/mg";

let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  i18n.set("en");
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mountHeader structure", () => {
  test("prepends a header into the chosen mount", () => {
    const filler = document.createElement("p");
    host.appendChild(filler);
    mountHeader({ icon: "🚜", title: "Farm", mount: host });
    expect(host.firstElementChild?.classList.contains("mg-header")).toBe(true);
  });

  test("renders the brand icon and a literal title", () => {
    mountHeader({ icon: "💣", title: "Sweeper", mount: host });
    expect(host.querySelector(".mg-brand-icon")?.textContent).toBe("💣");
    expect(host.querySelector(".mg-brand-title")?.textContent).toBe("Sweeper");
  });

  test("brand links home (default ../../)", () => {
    mountHeader({ title: "X", mount: host });
    const brand = host.querySelector(".mg-brand") as HTMLAnchorElement;
    expect(brand.getAttribute("href")).toBe("../../");
  });

  test("includes a language selector unless disabled", () => {
    mountHeader({ title: "X", mount: host });
    expect(host.querySelector(".mg-lang")).not.toBeNull();
    document.body.innerHTML = "";
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    mountHeader({ title: "X", mount: host2, lang: false });
    expect(host2.querySelector(".mg-lang")).toBeNull();
  });
});

describe("mountHeader titles via i18n", () => {
  test("uses a titleKey and re-localizes on language change", () => {
    i18n.register({
      en: { hdrTitle: "Garden" },
      ru: { hdrTitle: "Сад" },
      es: { hdrTitle: "Jardín" },
    });
    mountHeader({ titleKey: "hdrTitle", mount: host });
    expect(host.querySelector(".mg-brand-title")?.textContent).toBe("Garden");
    i18n.set("es");
    expect(host.querySelector(".mg-brand-title")?.textContent).toBe("Jardín");
  });

  test("sets the document title from the icon + title", () => {
    mountHeader({ icon: "🎲", title: "Dice", mount: host });
    expect(document.title).toBe("🎲 Dice — Minigames");
  });
});

describe("mountHeader stats", () => {
  test("renders stat chips with localized labels and initial values", () => {
    i18n.register({ en: { coins: "Coins" } });
    const ui = mountHeader({
      title: "X",
      mount: host,
      stats: [{ key: "coins", labelKey: "coins", value: 30 }],
    });
    expect(host.querySelector(".mg-stat-k")?.textContent).toBe("Coins");
    expect(ui.stat("coins")?.textContent).toBe("30");
  });

  test("setStat updates a chip's value", () => {
    const ui = mountHeader({
      title: "X",
      mount: host,
      stats: [{ key: "err", labelKey: "err" }],
    });
    ui.setStat("err", 4);
    expect(ui.stat("err")?.textContent).toBe("4");
  });

  test("applies a stat variant class", () => {
    mountHeader({
      title: "X",
      mount: host,
      stats: [{ key: "err", label: "Errors", variant: "alert" }],
    });
    expect(host.querySelector(".mg-stat--alert")).not.toBeNull();
  });
});

describe("mountHeader actions", () => {
  test("renders an action button wired to its onClick", () => {
    let clicks = 0;
    const ui = mountHeader({
      title: "X",
      mount: host,
      actions: [{ key: "new", label: "New", onClick: () => clicks++ }],
    });
    const btn = ui.action("new");
    expect(btn?.textContent).toBe("New");
    btn?.dispatchEvent(new Event("click"));
    expect(clicks).toBe(1);
  });

  test("re-localizes action labels on language change", () => {
    i18n.register({ en: { newGame: "New" }, es: { newGame: "Nuevo" } });
    const ui = mountHeader({
      title: "X",
      mount: host,
      actions: [{ key: "new", labelKey: "newGame" }],
    });
    expect(ui.action("new")?.textContent).toBe("New");
    i18n.set("es");
    expect(ui.action("new")?.textContent).toBe("Nuevo");
  });
});

describe("mountHeader unknown keys", () => {
  test("setStat / stat / action are safe for unknown keys", () => {
    const ui = mountHeader({ title: "X", mount: host });
    expect(() => ui.setStat("nope", 1)).not.toThrow();
    expect(ui.stat("nope")).toBeNull();
    expect(ui.action("nope")).toBeNull();
  });
});
