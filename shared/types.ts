/* ==========================================================================
   Minigames — shared runtime types (the public surface of window.MG)
   --------------------------------------------------------------------------
   The contract that both the shared runtime (shared/mg.ts, shared/cards.ts)
   and the games are written against. Kept in its own module so games can
   import just the types without pulling in the runtime, and so the runtime
   and its consumers stay in sync.
   ========================================================================== */

export type Lang = "en" | "ru" | "es";

/** A per-language string table. Values may be any type (strings, arrays, …). */
export type StringTable = Record<string, unknown>;

/** A `{ en, ru, es }` dictionary as passed to `MG.i18n.register`. */
export type Translations = Partial<Record<Lang, StringTable>>;

export interface I18n {
  readonly SUPPORTED: readonly Lang[];
  readonly LABELS: Record<Lang, string>;
  /** Merge a `{ en, ru, es }` dictionary into the tables. */
  register(translations: Translations | null | undefined): I18n;
  /**
   * Translate a key in the current language, falling back to English then the
   * key itself. The stored value may be any type; the optional type parameter
   * documents what the caller expects (defaults to `string`).
   */
  t<T = string>(key: string): T;
  /** Change the active language (no-op for an unsupported/identical value). */
  set(lng: string): void;
  /** Subscribe to language changes; returns an unsubscribe function. */
  onChange(fn: (lng: Lang) => void): () => void;
  readonly lang: Lang;
}

export type StatVariant = "alert" | "sm";

export interface StatDef {
  key: string;
  label?: string;
  labelKey?: string;
  variant?: StatVariant;
  value?: string | number;
}

export interface ActionDef {
  key?: string;
  id?: string;
  label?: string;
  labelKey?: string;
  titleKey?: string;
  onClick?: (this: HTMLButtonElement, ev: MouseEvent) => void;
}

export interface MountHeaderOpts {
  icon?: string;
  /** Literal brand title. Prefer `titleKey` for localized titles. */
  title?: string;
  /** i18n key for the brand title (re-localizes on language change). */
  titleKey?: string;
  /** Brand link target (defaults to "../../"). */
  home?: string;
  /** Show the language selector (default true). */
  lang?: boolean;
  /** Container the header is prepended to (default document.body). */
  mount?: HTMLElement;
  /** Update document.title from the brand title (default true). */
  documentTitle?: boolean;
  stats?: StatDef[];
  actions?: ActionDef[];
}

export interface HeaderUI {
  el: HTMLElement;
  /** Update a stat chip's value. */
  setStat(key: string, val: string | number): void;
  /** The value `<span>` for a stat (e.g. for flash animations), or null. */
  stat(key: string): HTMLSpanElement | null;
  /** The `<button>` for an action, or null. */
  action(key: string): HTMLButtonElement | null;
  /** Re-apply all localized labels. */
  refresh(): void;
}

/** A migration step: upgrades the previous version's data to `version`. */
export type Migration = (data: any, version: number) => any;

export interface StorageOpts {
  version?: number;
  migrations?: Record<number, Migration>;
}

export interface SaveStore<T = any> {
  readonly key: string;
  readonly version: number;
  /** The current data, migrated if needed, or null when nothing is saved. */
  load(): T | null;
  /** Persist `data` at the current version; returns it. */
  save(data: T): T;
  /** load → mutate → save in one call. */
  update(fn: (current: T | null) => T): T;
  /** Wipe this game's save. */
  clear(): void;
}

export interface SaveSummary {
  name: string;
  key: string;
  version: number;
  savedAt: number | null;
}

export interface StorageFactory {
  <T = any>(name: string, opts?: StorageOpts): SaveStore<T>;
  /** Enumerate all persisted saves, most-recently-saved first. */
  list(): SaveSummary[];
  /** Remove a single save by name. */
  remove(name: string): void;
  /** Wipe every game's save. */
  clearAll(): void;
}

/* --------------------------------------------------------------- cards -- */

export type SuitId = "S" | "H" | "C" | "D";
export type CardColor = "red" | "black";

export interface Suit {
  id: SuitId;
  name: string;
  symbol: string;
  color: CardColor;
}

/** A plain playing-card record. */
export interface Card {
  /** Stable id: suit letter + rank number (e.g. "H7"). */
  id: string;
  suit: SuitId;
  /** 1 = Ace … 11 = J, 12 = Q, 13 = K. */
  rank: number;
  color: CardColor;
  /** Rank label printed in the corner: A 2 … 10 J Q K. */
  label: string;
  suitSymbol: string;
  suitName: string;
}

export interface DealtDeck {
  cards: Card[];
  seed: number;
}

export interface Cards {
  readonly SUITS: readonly Suit[];
  readonly RANK_LABELS: Record<number, string>;
  makeCard(suitId: SuitId, rank: number): Card;
  makeDeck(): Card[];
  shuffle(cards: Card[], rand?: () => number): Card[];
  rng(seed: number): () => number;
  randomSeed(): number;
  dealDeck(seed?: number): DealtDeck;
  renderCard(card: Card, faceUp?: boolean): HTMLDivElement;
  isRed(card: Card): boolean;
  isBlack(card: Card): boolean;
}

/** The shared runtime exposed as `window.MG`. */
export interface MGGlobal {
  i18n: I18n;
  mountHeader(opts?: MountHeaderOpts): HeaderUI;
  storage: StorageFactory;
  el(tag: string, cls?: string | null, text?: string | null): HTMLElement;
  /** Present once shared/cards is loaded. */
  cards?: Cards;
}
