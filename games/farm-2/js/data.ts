export const SIZE = 12;
export const TILE_W = 92;
export const TILE_H = 46;

export type Item =
  | "wheat"
  | "carrot"
  | "tomato"
  | "corn"
  | "pumpkin"
  | "berry"
  | "egg"
  | "milk"
  | "wool"
  | "flour"
  | "bread"
  | "salad"
  | "pie"
  | "cheese";
export type Crop = "wheat" | "carrot" | "tomato" | "corn" | "pumpkin" | "berry";
export type Kind =
  | "cottage"
  | "plot"
  | "coop"
  | "barn"
  | "kitchen"
  | "mill"
  | "dairy"
  | "silo"
  | "well"
  | "path"
  | "tree"
  | "fence";
export type Species = "chicken" | "cow" | "sheep";
export type Recipe = "flour" | "bread" | "salad" | "pie" | "cheese";
export type Names = [en: string, ru: string, es: string];

export const ITEMS: Record<Item, { names: Names; icon: string; price: number; color: string }> = {
  wheat: { names: ["Wheat", "Пшеница", "Trigo"], icon: "🌾", price: 5, color: "#e3b44a" },
  carrot: { names: ["Carrot", "Морковь", "Zanahoria"], icon: "🥕", price: 9, color: "#ed8d3e" },
  tomato: { names: ["Tomato", "Помидоры", "Tomates"], icon: "🍅", price: 13, color: "#e3674f" },
  corn: { names: ["Corn", "Кукуруза", "Maíz"], icon: "🌽", price: 17, color: "#f3cc62" },
  pumpkin: { names: ["Pumpkin", "Тыква", "Calabaza"], icon: "🎃", price: 24, color: "#da833c" },
  berry: { names: ["Berries", "Ягоды", "Bayas"], icon: "🍓", price: 21, color: "#d96269" },
  egg: { names: ["Eggs", "Яйца", "Huevos"], icon: "🥚", price: 12, color: "#eadcbd" },
  milk: { names: ["Milk", "Молоко", "Leche"], icon: "🥛", price: 22, color: "#d8e9ec" },
  wool: { names: ["Wool", "Шерсть", "Lana"], icon: "🧶", price: 26, color: "#e9d9bd" },
  flour: { names: ["Flour", "Мука", "Harina"], icon: "🌾", price: 13, color: "#ddc89d" },
  bread: { names: ["Bread", "Хлеб", "Pan"], icon: "🍞", price: 39, color: "#d3944f" },
  salad: {
    names: ["Garden salad", "Овощной салат", "Ensalada"],
    icon: "🥗",
    price: 64,
    color: "#97b75b",
  },
  pie: {
    names: ["Pumpkin pie", "Тыквенный пирог", "Tarta"],
    icon: "🥧",
    price: 130,
    color: "#d5954f",
  },
  cheese: {
    names: ["Farm cheese", "Фермерский сыр", "Queso"],
    icon: "🧀",
    price: 87,
    color: "#f3ca63",
  },
};
export const CROPS: Record<
  Crop,
  { seconds: number; cost: number; yield: number; xp: number; level: number }
> = {
  wheat: { seconds: 30, cost: 0, yield: 2, xp: 3, level: 1 },
  carrot: { seconds: 45, cost: 3, yield: 2, xp: 4, level: 1 },
  tomato: { seconds: 65, cost: 5, yield: 3, xp: 5, level: 1 },
  corn: { seconds: 90, cost: 8, yield: 3, xp: 7, level: 2 },
  pumpkin: { seconds: 120, cost: 12, yield: 3, xp: 9, level: 3 },
  berry: { seconds: 100, cost: 10, yield: 3, xp: 8, level: 2 },
};
export const BUILDINGS: Record<
  Kind,
  {
    names: Names;
    w: number;
    h: number;
    cost: number;
    category: "grow" | "produce" | "decorate";
    color: string;
    icon: string;
  }
> = {
  cottage: {
    names: ["Farmhouse", "Дом фермера", "Casa"],
    w: 2,
    h: 2,
    cost: 0,
    category: "decorate",
    color: "#617d8a",
    icon: "home",
  },
  plot: {
    names: ["Garden bed", "Грядка", "Parcela"],
    w: 1,
    h: 1,
    cost: 12,
    category: "grow",
    color: "#b68757",
    icon: "sprout",
  },
  coop: {
    names: ["Chicken coop", "Курятник", "Gallinero"],
    w: 2,
    h: 2,
    cost: 100,
    category: "grow",
    color: "#d39256",
    icon: "egg",
  },
  barn: {
    names: ["Animal barn", "Хлев", "Establo"],
    w: 2,
    h: 3,
    cost: 240,
    category: "grow",
    color: "#ba6460",
    icon: "barn",
  },
  kitchen: {
    names: ["Country kitchen", "Деревенская кухня", "Cocina"],
    w: 2,
    h: 2,
    cost: 140,
    category: "produce",
    color: "#d38955",
    icon: "pot",
  },
  mill: {
    names: ["Windmill", "Мельница", "Molino"],
    w: 2,
    h: 2,
    cost: 180,
    category: "produce",
    color: "#899dab",
    icon: "mill",
  },
  dairy: {
    names: ["Cheese dairy", "Сыроварня", "Quesería"],
    w: 2,
    h: 2,
    cost: 160,
    category: "produce",
    color: "#8b9f82",
    icon: "cheese",
  },
  silo: {
    names: ["Silo", "Силосная башня", "Silo"],
    w: 1,
    h: 1,
    cost: 65,
    category: "decorate",
    color: "#9bafb3",
    icon: "silo",
  },
  well: {
    names: ["Stone well", "Колодец", "Pozo"],
    w: 1,
    h: 1,
    cost: 45,
    category: "decorate",
    color: "#87989c",
    icon: "water",
  },
  path: {
    names: ["Stone path", "Дорожка", "Camino"],
    w: 1,
    h: 1,
    cost: 3,
    category: "decorate",
    color: "#d5c5a5",
    icon: "path",
  },
  tree: {
    names: ["Apple tree", "Яблоня", "Manzano"],
    w: 1,
    h: 1,
    cost: 25,
    category: "decorate",
    color: "#718e52",
    icon: "tree",
  },
  fence: {
    names: ["White fence", "Белый забор", "Valla"],
    w: 1,
    h: 1,
    cost: 7,
    category: "decorate",
    color: "#e2d8c1",
    icon: "fence",
  },
};
export const ANIMALS: Record<
  Species,
  {
    names: Names;
    icon: string;
    kind: Kind;
    cost: number;
    seconds: number;
    product: Item;
    feed: number;
  }
> = {
  chicken: {
    names: ["Chicken", "Курица", "Gallina"],
    icon: "🐔",
    kind: "coop",
    cost: 40,
    seconds: 30,
    product: "egg",
    feed: 1,
  },
  cow: {
    names: ["Cow", "Корова", "Vaca"],
    icon: "🐄",
    kind: "barn",
    cost: 160,
    seconds: 55,
    product: "milk",
    feed: 2,
  },
  sheep: {
    names: ["Sheep", "Овца", "Oveja"],
    icon: "🐑",
    kind: "barn",
    cost: 120,
    seconds: 45,
    product: "wool",
    feed: 2,
  },
};
export const RECIPES: Record<
  Recipe,
  {
    at: Kind;
    seconds: number;
    ingredients: Partial<Record<Item, number>>;
    amount: number;
    xp: number;
  }
> = {
  flour: { at: "mill", seconds: 20, ingredients: { wheat: 3 }, amount: 2, xp: 5 },
  bread: { at: "kitchen", seconds: 25, ingredients: { flour: 2 }, amount: 1, xp: 9 },
  salad: { at: "kitchen", seconds: 18, ingredients: { carrot: 2, tomato: 2 }, amount: 1, xp: 12 },
  pie: {
    at: "kitchen",
    seconds: 50,
    ingredients: { pumpkin: 2, flour: 2, egg: 1 },
    amount: 1,
    xp: 20,
  },
  cheese: { at: "dairy", seconds: 40, ingredients: { milk: 3 }, amount: 1, xp: 15 },
};
export const ORDER_POOL: {
  items: Partial<Record<Item, number>>;
  coins: number;
  xp: number;
  person: string;
}[] = [
  { items: { wheat: 6 }, coins: 42, xp: 12, person: "mila" },
  { items: { egg: 3, carrot: 2 }, coins: 75, xp: 18, person: "oscar" },
  { items: { bread: 2 }, coins: 100, xp: 25, person: "lily" },
  { items: { salad: 1, milk: 2 }, coins: 140, xp: 30, person: "mila" },
  { items: { flour: 3 }, coins: 60, xp: 18, person: "oscar" },
  { items: { cheese: 1 }, coins: 115, xp: 25, person: "lily" },
  { items: { wool: 2 }, coins: 80, xp: 22, person: "mila" },
  { items: { pie: 1 }, coins: 170, xp: 40, person: "oscar" },
];
export const GOALS = [
  { stat: "harvested", target: 2, coins: 35 },
  { stat: "built", target: 2, coins: 45 },
  { stat: "fed", target: 1, coins: 40 },
  { stat: "cooked", target: 1, coins: 55 },
  { stat: "delivered", target: 1, coins: 70 },
  { stat: "moved", target: 2, coins: 50 },
] as const;
