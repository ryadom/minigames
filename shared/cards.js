/* ==========================================================================
   Minigames — shared playing-card runtime (window.MG.cards)
   --------------------------------------------------------------------------
   The bits every card game needs, so they aren't re-implemented per game:

     • A standard 52-card model (suits, ranks, colors, labels).
     • Deck building + a seeded shuffle (so a deal can be reproduced / shared).
     • A small DOM card renderer that yields a consistent, themeable card face.

   Like the rest of the shared runtime this is dependency-free, ES5-friendly and
   loaded with a plain <script> tag. It attaches to the existing window.MG.

   A card object is a plain record:

     {
       id:    "H7",       // stable id, suit letter + rank number (1..13)
       suit:  "H",        // S C H D
       rank:  7,          // 1 = Ace … 11 = J, 12 = Q, 13 = K
       color: "red",      // "red" | "black"
       label: "7",        // rank label: A 2 … 10 J Q K
       suitSymbol: "♥",   // ♠ ♣ ♥ ♦
       suitName: "hearts"
     }
   ========================================================================== */
(function (global) {
  "use strict";

  // Suit order is the conventional S, H, C, D but each suit carries its color
  // and glyph so games never hardcode them.
  var SUITS = [
    { id: "S", name: "spades",   symbol: "♠", color: "black" },
    { id: "H", name: "hearts",   symbol: "♥", color: "red" },
    { id: "C", name: "clubs",    symbol: "♣", color: "black" },
    { id: "D", name: "diamonds", symbol: "♦", color: "red" }
  ];

  var SUIT_BY_ID = {};
  SUITS.forEach(function (s) { SUIT_BY_ID[s.id] = s; });

  // Rank 1..13. The label is what's printed in the corner.
  var RANK_LABELS = {
    1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7",
    8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K"
  };

  function makeCard(suitId, rank) {
    var s = SUIT_BY_ID[suitId];
    return {
      id: suitId + rank,
      suit: suitId,
      rank: rank,
      color: s.color,
      label: RANK_LABELS[rank],
      suitSymbol: s.symbol,
      suitName: s.name
    };
  }

  // A fresh, ordered 52-card deck.
  function makeDeck() {
    var deck = [];
    for (var i = 0; i < SUITS.length; i++) {
      for (var r = 1; r <= 13; r++) deck.push(makeCard(SUITS[i].id, r));
    }
    return deck;
  }

  /* ---------------------------------------------------------------- rng -- */
  // mulberry32: a tiny, fast, seedable PRNG. Returns a function producing
  // floats in [0, 1). Given the same seed it yields the same sequence, so a
  // deal can be reproduced or shared by its seed.
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A random 32-bit seed (for "new game" when no seed is supplied).
  function randomSeed() {
    return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1;
  }

  // Fisher–Yates shuffle. Mutates and returns `cards`. `rand` is an optional
  // 0..1 generator (e.g. from rng(seed)); defaults to Math.random.
  function shuffle(cards, rand) {
    rand = rand || Math.random;
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp;
    }
    return cards;
  }

  // Convenience: a shuffled deck for `seed` (or a fresh random one). Returns
  // { cards, seed } so callers can persist/share the seed.
  function dealDeck(seed) {
    seed = seed || randomSeed();
    return { cards: shuffle(makeDeck(), rng(seed)), seed: seed };
  }

  /* ------------------------------------------------------------- render -- */
  // Build a card face element. `card` is a card record; if `faceUp` is false a
  // patterned back is rendered instead. The markup is intentionally simple and
  // styled by shared/cards.css (which a game loads alongside this script):
  //
  //   <div class="mg-card is-red" data-id="H7">
  //     <span class="mg-card-corner mg-card-tl">7<br>♥</span>
  //     <span class="mg-card-pip">♥</span>
  //     <span class="mg-card-corner mg-card-br">7<br>♥</span>
  //   </div>
  function renderCard(card, faceUp) {
    var node = document.createElement("div");
    if (faceUp === false) {
      node.className = "mg-card mg-card-back";
      return node;
    }
    node.className = "mg-card is-" + card.color;
    node.setAttribute("data-id", card.id);

    var corner = function (pos) {
      var c = document.createElement("span");
      c.className = "mg-card-corner mg-card-" + pos;
      var r = document.createElement("b");
      r.className = "mg-card-rank";
      r.textContent = card.label;
      var s = document.createElement("span");
      s.className = "mg-card-suit";
      s.textContent = card.suitSymbol;
      c.appendChild(r);
      c.appendChild(s);
      return c;
    };

    var pip = document.createElement("span");
    pip.className = "mg-card-pip";
    pip.textContent = card.suitSymbol;

    node.appendChild(corner("tl"));
    node.appendChild(pip);
    node.appendChild(corner("br"));
    return node;
  }

  /* --------------------------------------------------------------- expose -- */
  var MG = global.MG || {};
  MG.cards = {
    SUITS: SUITS,
    RANK_LABELS: RANK_LABELS,
    makeCard: makeCard,
    makeDeck: makeDeck,
    shuffle: shuffle,
    rng: rng,
    randomSeed: randomSeed,
    dealDeck: dealDeck,
    renderCard: renderCard,
    isRed: function (card) { return card.color === "red"; },
    isBlack: function (card) { return card.color === "black"; }
  };
  global.MG = MG;
})(window);
