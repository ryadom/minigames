/* Tests for the shared playing-card runtime (shared/cards.ts). */
import { describe, expect, test } from "bun:test";
import { cards } from "../shared/cards";

describe("cards.makeCard", () => {
  test("builds a card record with derived color, label and glyph", () => {
    const c = cards.makeCard("H", 7);
    expect(c).toEqual({
      id: "H7",
      suit: "H",
      rank: 7,
      color: "red",
      label: "7",
      suitSymbol: "♥",
      suitName: "hearts",
    });
  });

  test("maps face ranks to their printed labels", () => {
    expect(cards.makeCard("S", 1).label).toBe("A");
    expect(cards.makeCard("C", 10).label).toBe("10");
    expect(cards.makeCard("D", 11).label).toBe("J");
    expect(cards.makeCard("H", 12).label).toBe("Q");
    expect(cards.makeCard("S", 13).label).toBe("K");
  });

  test("spades and clubs are black, hearts and diamonds red", () => {
    expect(cards.makeCard("S", 2).color).toBe("black");
    expect(cards.makeCard("C", 2).color).toBe("black");
    expect(cards.makeCard("H", 2).color).toBe("red");
    expect(cards.makeCard("D", 2).color).toBe("red");
  });
});

describe("cards.makeDeck", () => {
  test("is a standard, complete 52-card deck", () => {
    const deck = cards.makeDeck();
    expect(deck).toHaveLength(52);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(52);
  });

  test("holds 13 cards of each suit", () => {
    const deck = cards.makeDeck();
    for (const suit of ["S", "H", "C", "D"]) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
    }
  });
});

describe("cards.rng", () => {
  test("is deterministic for a given seed", () => {
    const a = cards.rng(12345);
    const b = cards.rng(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  test("different seeds diverge", () => {
    const a = cards.rng(1);
    const b = cards.rng(2);
    expect(a()).not.toBe(b());
  });

  test("emits floats in [0, 1)", () => {
    const r = cards.rng(99);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("cards.shuffle", () => {
  test("keeps every card (a permutation of the input)", () => {
    const deck = cards.makeDeck();
    const before = deck.map((c) => c.id).sort();
    cards.shuffle(deck, cards.rng(7));
    const after = deck.map((c) => c.id).sort();
    expect(after).toEqual(before);
    expect(deck).toHaveLength(52);
  });

  test("a seeded shuffle is reproducible", () => {
    const d1 = cards.shuffle(cards.makeDeck(), cards.rng(42)).map((c) => c.id);
    const d2 = cards.shuffle(cards.makeDeck(), cards.rng(42)).map((c) => c.id);
    expect(d1).toEqual(d2);
  });

  test("actually reorders the deck", () => {
    const ordered = cards.makeDeck().map((c) => c.id);
    const shuffled = cards.shuffle(cards.makeDeck(), cards.rng(123)).map((c) => c.id);
    expect(shuffled).not.toEqual(ordered);
  });
});

describe("cards.dealDeck", () => {
  test("returns a shuffled 52-card deck and its seed", () => {
    const { cards: dealt, seed } = cards.dealDeck(555);
    expect(dealt).toHaveLength(52);
    expect(seed).toBe(555);
  });

  test("the same seed reproduces the same deal", () => {
    const a = cards.dealDeck(2024).cards.map((c) => c.id);
    const b = cards.dealDeck(2024).cards.map((c) => c.id);
    expect(a).toEqual(b);
  });

  test("a seedless deal still yields a non-zero seed and full deck", () => {
    const { cards: dealt, seed } = cards.dealDeck();
    expect(dealt).toHaveLength(52);
    expect(seed).toBeGreaterThan(0);
  });
});

describe("cards.randomSeed", () => {
  test("is a positive 32-bit integer", () => {
    for (let i = 0; i < 50; i++) {
      const s = cards.randomSeed();
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(s)).toBe(true);
    }
  });
});

describe("cards color helpers", () => {
  test("isRed / isBlack agree with the card color", () => {
    expect(cards.isRed(cards.makeCard("H", 5))).toBe(true);
    expect(cards.isBlack(cards.makeCard("H", 5))).toBe(false);
    expect(cards.isBlack(cards.makeCard("S", 5))).toBe(true);
    expect(cards.isRed(cards.makeCard("S", 5))).toBe(false);
  });
});

describe("cards.renderCard", () => {
  test("renders a face-up card with corners, pip and data-id", () => {
    const node = cards.renderCard(cards.makeCard("H", 7), true);
    expect(node.className).toBe("mg-card is-red");
    expect(node.getAttribute("data-id")).toBe("H7");
    expect(node.querySelector(".mg-card-pip")?.textContent).toBe("♥");
    expect(node.querySelectorAll(".mg-card-corner")).toHaveLength(2);
    expect(node.querySelector(".mg-card-rank")?.textContent).toBe("7");
  });

  test("renders a patterned back when face-down", () => {
    const node = cards.renderCard(cards.makeCard("S", 1), false);
    expect(node.className).toBe("mg-card mg-card-back");
    expect(node.querySelector(".mg-card-pip")).toBeNull();
  });
});
