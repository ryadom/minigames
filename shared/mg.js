/* ==========================================================================
   Minigames — shared runtime (window.MG)
   --------------------------------------------------------------------------
   A tiny, dependency-free helper that every game loads with a plain
   <script> tag. It provides the two things games kept re-implementing:

     • MG.i18n      — language detection, persistence and translation, shared
                      across every game and the home page (one localStorage
                      key, so the chosen language follows the player around).
     • MG.mountHeader — a consistent top header bar (brand link home, optional
                      stat chips, a language selector and action buttons).

   No build step, no framework: load shared/mg.css + shared/mg.js and call
   MG.i18n.register({...}) then MG.mountHeader({...}).
   ========================================================================== */
(function (global) {
  "use strict";

  /* ----------------------------------------------------------------- i18n -- */
  var STORAGE_KEY = "mg.lang";
  var SUPPORTED = ["en", "ru", "es"];
  var LABELS = { en: "EN", ru: "RU", es: "ES" };

  // Per-language string tables. Games merge their own strings via register().
  var dict = { en: {}, ru: {}, es: {} };
  var listeners = [];

  function detect() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) { /* private mode — fall through to navigator */ }
    var l = (navigator.language || "en").slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(l) !== -1 ? l : "en";
  }

  var current = detect();

  // Merge a { en: {...}, ru: {...}, es: {...} } dictionary into the tables.
  function register(translations) {
    if (!translations) return i18n;
    SUPPORTED.forEach(function (lng) {
      var src = translations[lng];
      if (!src) return;
      for (var key in src) {
        if (Object.prototype.hasOwnProperty.call(src, key)) dict[lng][key] = src[key];
      }
    });
    return i18n;
  }

  // Look up a key in the current language, falling back to English, then the
  // key itself. Values may be any type (strings, arrays, …).
  function t(key) {
    var table = dict[current] || dict.en;
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    if (Object.prototype.hasOwnProperty.call(dict.en, key)) return dict.en[key];
    return key;
  }

  function set(lng) {
    if (SUPPORTED.indexOf(lng) === -1 || lng === current) return;
    current = lng;
    try { localStorage.setItem(STORAGE_KEY, lng); } catch (e) { /* ignore */ }
    document.documentElement.lang = lng;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) { /* a bad listener shouldn't break the rest */ }
    }
  }

  // Subscribe to language changes; returns an unsubscribe function.
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  var i18n = {
    SUPPORTED: SUPPORTED,
    LABELS: LABELS,
    register: register,
    t: t,
    set: set,
    onChange: onChange,
    get lang() { return current; }
  };

  // Reflect the detected language on <html> as early as possible.
  try { document.documentElement.lang = current; } catch (e) { /* ignore */ }

  /* --------------------------------------------------------------- header -- */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * Mount a shared header bar.
   *
   *   var ui = MG.mountHeader({
   *     icon: "💣",
   *     titleKey: "title",            // i18n key (or use `title` for a literal)
   *     home: "../../",               // brand link target (defaults to ../../)
   *     lang: true,                   // show the language selector (default)
   *     mount: document.body,         // container; header is prepended (default: body)
   *     stats: [
   *       { key: "err", labelKey: "errors", variant: "alert" },
   *       { key: "pos", labelKey: "position", variant: "sm", value: "0, 0" }
   *     ],
   *     actions: [
   *       { key: "new", labelKey: "new", onClick: fn }
   *     ]
   *   });
   *
   *   ui.setStat("err", 3);           // update a stat value
   *   ui.stat("err");                 // the value <span> (for animations)
   *   ui.action("new");               // the action <button>
   *
   * Stat / action labels and the document title re-localize automatically
   * whenever the language changes.
   */
  function mountHeader(opts) {
    opts = opts || {};
    var header = el("header", "mg-header");

    // Brand — links back to the games home.
    var brand = el("a", "mg-brand");
    brand.href = opts.home || "../../";
    brand.appendChild(el("span", "mg-brand-icon", opts.icon || "🎮"));
    var brandTitle = el("b", "mg-brand-title");
    brand.appendChild(brandTitle);
    header.appendChild(brand);

    // Stat chips.
    var statRefs = {};
    if (opts.stats && opts.stats.length) {
      var slot = el("div", "mg-slot");
      opts.stats.forEach(function (s) {
        var chip = el("div", "mg-stat" + (s.variant ? " mg-stat--" + s.variant : ""));
        var label = el("span", "mg-stat-k");
        var value = el("span", "mg-stat-v", s.value != null ? String(s.value) : "0");
        chip.appendChild(label);
        chip.appendChild(value);
        slot.appendChild(chip);
        statRefs[s.key] = { label: label, value: value, def: s };
      });
      header.appendChild(slot);
    }

    // Actions — language selector first, then game buttons.
    var actions = el("div", "mg-actions");
    var langSel = null;
    if (opts.lang !== false) {
      langSel = el("select", "mg-lang");
      langSel.setAttribute("aria-label", "Language");
      SUPPORTED.forEach(function (lng) {
        var o = el("option", null, LABELS[lng]);
        o.value = lng;
        langSel.appendChild(o);
      });
      langSel.value = current;
      langSel.addEventListener("change", function () { set(langSel.value); });
      actions.appendChild(langSel);
    }

    var actionRefs = {};
    (opts.actions || []).forEach(function (a) {
      var btn = el("button", "mg-btn");
      if (a.id) btn.id = a.id;
      if (a.onClick) btn.addEventListener("click", a.onClick);
      actionRefs[a.key || a.id] = { btn: btn, def: a };
      actions.appendChild(btn);
    });
    header.appendChild(actions);

    var container = opts.mount || document.body;
    container.insertBefore(header, container.firstChild);

    function applyText() {
      var title = opts.titleKey ? t(opts.titleKey) : (opts.title || "");
      brandTitle.textContent = title;
      if (opts.documentTitle !== false) {
        document.title = (opts.icon ? opts.icon + " " : "") + title + " — Minigames";
      }
      var key;
      for (key in statRefs) {
        var sref = statRefs[key];
        if (sref.def.labelKey) sref.label.textContent = t(sref.def.labelKey);
        else if (sref.def.label) sref.label.textContent = sref.def.label;
      }
      for (key in actionRefs) {
        var aref = actionRefs[key];
        if (aref.def.labelKey) aref.btn.textContent = t(aref.def.labelKey);
        else if (aref.def.label) aref.btn.textContent = aref.def.label;
        if (aref.def.titleKey) aref.btn.title = t(aref.def.titleKey);
      }
      if (langSel) langSel.value = current;
    }

    applyText();
    onChange(applyText);

    return {
      el: header,
      setStat: function (key, val) {
        if (statRefs[key]) statRefs[key].value.textContent = String(val);
      },
      stat: function (key) { return statRefs[key] ? statRefs[key].value : null; },
      action: function (key) { return actionRefs[key] ? actionRefs[key].btn : null; },
      refresh: applyText
    };
  }

  /* --------------------------------------------------------------- expose -- */
  var MG = global.MG || {};
  MG.i18n = i18n;
  MG.mountHeader = mountHeader;
  MG.el = el;
  global.MG = MG;
})(window);
