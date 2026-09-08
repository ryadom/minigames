import { BUILDINGS, CROPS, type Crop, type Kind, type Species, TILE_H, TILE_W } from "./data";
import type { Entity } from "./model";

export type Point = [number, number];
export const project = (x: number, y: number, z = 0): Point => [
  ((x - y) * TILE_W) / 2,
  ((x + y) * TILE_H) / 2 - z,
];
export function unproject(x: number, y: number): Point {
  return [x / TILE_W + y / TILE_H, y / TILE_H - x / TILE_W];
}
export function polygon(
  c: CanvasRenderingContext2D,
  points: Point[],
  fill: string,
  stroke?: string,
): void {
  c.beginPath();
  points.forEach(([x, y], i) => {
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  });
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 0.8;
    c.stroke();
  }
}
export function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
function line(c: CanvasRenderingContext2D, a: Point, b: Point, color: string, width = 2): void {
  c.beginPath();
  c.moveTo(...a);
  c.lineTo(...b);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.stroke();
}
export function tile(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  z = 0,
  stroke?: string,
): void {
  polygon(
    c,
    [project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)],
    color,
    stroke,
  );
}
function box(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  height: number,
  colors: [string, string, string],
): void {
  const [a, b, d, e] = [
    project(x, y, z),
    project(x + w, y, z),
    project(x + w, y + h, z),
    project(x, y + h, z),
  ];
  const up = ([x, y]: Point): Point => [x, y - height];
  polygon(c, [b, d, up(d), up(b)], colors[1]);
  polygon(c, [d, e, up(e), up(d)], colors[2]);
  polygon(c, [up(a), up(b), up(d), up(e)], colors[0]);
}
function front(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  z: number,
  h: number,
  color: string,
): void {
  polygon(
    c,
    [project(x, y, z), project(x + w, y, z), project(x + w, y, z + h), project(x, y, z + h)],
    color,
  );
}
function roof(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  z: number,
  height: number,
  color: [string, string, string],
): void {
  const a = project(x, y, z),
    b = project(x + w, y, z),
    d = project(x + w, y + h, z),
    e = project(x, y + h, z);
  const back = project(x + w / 2, y, z + height),
    peak = project(x + w / 2, y + h, z + height);
  polygon(c, [b, d, peak, back], color[0]);
  polygon(c, [a, back, peak, e], color[1]);
  polygon(c, [e, peak, d], color[2]);
  line(c, back, peak, "#ffffff35", 2);
  line(c, e, peak, "#fff4dc80", 2);
  line(c, peak, d, "#fff4dc80", 2);
  for (let i = 1; i < 5; i++)
    line(
      c,
      project(x + w / 2, y + (h * i) / 5, z + height),
      project(x + w, y + (h * i) / 5, z),
      "#293c4629",
      1,
    );
}
function house(c: CanvasRenderingContext2D, kind: Kind, w: number, h: number, time: number): void {
  const red = kind === "barn",
    kitchen = kind === "kitchen",
    dairy = kind === "dairy";
  const z = red ? 53 : 44;
  tile(c, 0.08, 0.08, w - 0.16, h - 0.16, "#9da17b", 1);
  const ox = 0.22,
    oy = 0.18,
    bw = w - 0.44,
    bh = h - 0.47;
  box(c, ox, oy, bw, bh, 3, z, [
    "#f6e7c9",
    red ? "#a6514e" : "#d0bb94",
    red ? "#c16b60" : "#f0dfbc",
  ]);
  for (let i = 1; i < 5; i++)
    front(c, ox, oy + bh, bw, (z * i) / 5, 1, red ? "#944a4040" : "#a9947628");
  front(c, ox + 0.25, oy + bh, 0.4, 3, 29, red ? "#794536" : "#708b86");
  front(c, ox + 0.27, oy + bh, 0.35, 4, 26, red ? "#895144" : "#536f69");
  const door = project(ox + 0.52, oy + bh, 17);
  ellipse(c, ...door, 1.7, 1.7, "#e9c77c");
  front(c, ox + bw - 0.48, oy + bh, 0.34, 18, 18, "#fff8e2");
  front(c, ox + bw - 0.44, oy + bh, 0.26, 20, 14, "#89b5b9");
  line(c, project(ox + bw - 0.31, oy + bh, 20), project(ox + bw - 0.31, oy + bh, 34), "#fff9e4", 2);
  box(c, ox + bw - 0.5, oy + bh, 0.38, 0.12, 12, 5, ["#cdb597", "#ae8a66", "#b58d60"]);
  for (let i = 0; i < 4; i++) {
    const p = project(ox + bw - 0.47 + i * 0.09, oy + bh + 0.04, 19);
    ellipse(c, ...p, 3.8, 3.1, i % 2 ? "#e98f89" : "#709158");
  }
  roof(
    c,
    ox - 0.13,
    oy - 0.1,
    bw + 0.26,
    bh + 0.23,
    z + 3,
    27,
    red
      ? ["#745e61", "#8e7171", "#cd8d76"]
      : kitchen
        ? ["#b56749", "#d48e63", "#dfae83"]
        : dairy
          ? ["#678170", "#829d87", "#dce1b6"]
          : ["#577782", "#75949d", "#cdd6bc"],
  );
  if (!red) {
    box(c, w - 0.63, 0.4, 0.24, 0.25, z + 18, 21, ["#ece3d0", "#9b8272", "#c4aa8e"]);
    const chimney = project(w - 0.5, 0.52, z + 44);
    for (let i = 0; i < 3; i++) {
      const age = (time * 0.00025 + i / 3) % 1;
      c.globalAlpha = (1 - age) * 0.28;
      ellipse(c, chimney[0] + age * 17, chimney[1] - age * 42, 5 + age * 7, 4 + age * 5, "#fffef6");
    }
    c.globalAlpha = 1;
  }
  if (kitchen) {
    const p = project(w / 2, h - 0.2, 35);
    ellipse(c, ...p, 10, 8, "#fff2cf");
    line(c, [p[0] - 5, p[1]], [p[0] + 5, p[1]], "#a27850", 3);
  }
  box(c, 0.34, h - 0.1, 0.8, 0.2, 0, 4, ["#e3d4b7", "#b4a285", "#ccb99a"]);
}
function fence(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const posts: Point[] = [];
  if (w) for (let i = 0; i <= w * 2; i++) posts.push([x + i / 2, y]);
  if (h) for (let i = 0; i <= h * 2; i++) posts.push([x, y + i / 2]);
  for (const [a, b] of posts) {
    box(c, a - 0.035, b - 0.035, 0.07, 0.07, 0, 19, ["#fff6df", "#c8ba9e", "#e9ddc2"]);
  }
  if (w) for (const z of [7, 14]) line(c, project(x, y, z), project(x + w, y, z), "#eadfc4", 3.5);
  if (h) for (const z of [7, 14]) line(c, project(x, y, z), project(x, y + h, z), "#eadfc4", 3.5);
}
function animal(
  c: CanvasRenderingContext2D,
  species: Species,
  x: number,
  y: number,
  time: number,
  seed: number,
): void {
  const p = project(x, y);
  const bob = Math.sin(time * 0.005 + seed) * 0.6;
  c.save();
  c.translate(p[0], p[1] + bob);
  const chicken = species === "chicken";
  ellipse(c, 0, 0, chicken ? 7 : 13, chicken ? 3 : 5, "#30482e22");
  for (const dx of chicken ? [-2, 2] : [-7, 6])
    line(c, [dx, -3], [dx + 1, 1], chicken ? "#c7994a" : "#736858", 2);
  ellipse(
    c,
    0,
    chicken ? -7 : -11,
    chicken ? 6 : 13,
    chicken ? 5 : 8,
    species === "cow" ? "#f2e9d6" : "#fff7df",
  );
  if (species === "cow") {
    ellipse(c, -4, -13, 5, 4, "#716d5e");
    ellipse(c, 7, -16, 3, 2, "#716d5e");
  }
  if (species === "sheep") for (let i = 0; i < 5; i++) ellipse(c, -9 + i * 4, -15, 5, 5, "#f6efdc");
  ellipse(
    c,
    chicken ? 5 : 12,
    chicken ? -12 : -13,
    chicken ? 3.8 : 5,
    chicken ? 4 : 5,
    species === "sheep" ? "#737769" : "#fff5da",
  );
  if (chicken) {
    ellipse(c, 5, -16, 2, 2.5, "#d36a52");
    polygon(
      c,
      [
        [8, -12],
        [11, -10],
        [8, -9],
      ],
      "#d7a242",
    );
  } else if (species === "cow") ellipse(c, 15, -11, 3, 2, "#d7a091");
  ellipse(c, chicken ? 6 : 13, chicken ? -13 : -14, 0.8, 0.8, "#35453d");
  c.restore();
}
export function cropArt(
  c: CanvasRenderingContext2D,
  crop: Crop,
  ratio: number,
  seed = 0,
  time = 0,
): void {
  const grown = Math.max(0.12, ratio),
    ripe = ratio >= 1;
  for (let i = 0; i < 6; i++) {
    const x = 0.22 + (i % 3) * 0.27,
      y = 0.24 + Math.floor(i / 3) * 0.43,
      p = project(x, y, 3);
    const sway = Math.sin(time * 0.002 + seed + i) * 1.2;
    const height = (crop === "corn" ? 32 : crop === "wheat" ? 25 : 15) * grown;
    const green = ripe && crop === "wheat" ? "#cfac47" : "#668a3d";
    line(c, p, [p[0] + sway, p[1] - height], green, 2);
    ellipse(c, p[0] - 3, p[1] - height * 0.5, 4 * grown, 2.1, green);
    ellipse(c, p[0] + 4, p[1] - height * 0.65, 4 * grown, 2.1, green);
    if (crop === "wheat" || crop === "corn") {
      for (let k = 0; k < 3; k++) {
        ellipse(
          c,
          p[0] + sway - 2,
          p[1] - height + k * 3,
          2.6 * grown,
          3,
          ripe ? "#ecc761" : "#8ca957",
        );
        ellipse(
          c,
          p[0] + sway + 2,
          p[1] - height + k * 3 + 1,
          2.6 * grown,
          3,
          ripe ? "#e7bb51" : "#8ca957",
        );
      }
    } else if (ripe) {
      const color = crop === "tomato" ? "#da654c" : crop === "berry" ? "#ce5264" : "#e68e3d";
      ellipse(
        c,
        p[0] + 3,
        p[1] - (crop === "carrot" ? 3 : height * 0.6),
        crop === "pumpkin" ? 8 : 4.5,
        crop === "carrot" ? 6 : 4.5,
        color,
      );
      if (crop === "pumpkin")
        line(
          c,
          [p[0] + 3, p[1] - height * 0.6 - 3],
          [p[0] + 4, p[1] - height * 0.6 - 7],
          "#668442",
          2,
        );
    }
  }
}
export function drawEntity(c: CanvasRenderingContext2D, e: Entity, time = 0, ghost = false): void {
  const def = BUILDINGS[e.kind],
    w = e.rotated ? def.h : def.w,
    h = e.rotated ? def.w : def.h;
  const p = project(e.x, e.y);
  c.save();
  c.translate(...p);
  c.lineJoin = "round";
  if (ghost) c.globalAlpha = 0.65;
  if (e.kind === "plot") {
    tile(c, 0.03, 0.03, 0.94, 0.94, "#d2b188", 0);
    tile(c, 0.07, 0.07, 0.86, 0.86, e.watered ? "#876749" : "#a88358", 2);
    for (let i = 0; i < 4; i++)
      line(
        c,
        project(0.12, 0.15 + i * 0.2, 3),
        project(0.88, 0.15 + i * 0.2, 3),
        e.watered ? "#70573f" : "#906b46",
        2,
      );
    if (e.crop) cropArt(c, e.crop, e.growth / CROPS[e.crop].seconds, e.id, time);
  } else if (e.kind === "path") {
    tile(c, 0.01, 0.01, 0.98, 0.98, "#d7c9a8", 1);
    for (let i = 0; i < 4; i++)
      tile(
        c,
        0.07 + (i % 2) * 0.47,
        0.08 + Math.floor(i / 2) * 0.44,
        0.4,
        0.37,
        i % 2 ? "#e2d7bc" : "#c8bd9f",
        2,
      );
  } else if (e.kind === "tree") {
    const p = project(0.5, 0.5);
    ellipse(c, p[0] + 8, p[1] + 2, 24, 11, "#41613925");
    box(c, 0.46, 0.46, 0.1, 0.1, 0, 39, ["#a3865a", "#836640", "#a78a5b"]);
    for (const [dx, dy, r, col] of [
      [-13, -40, 19, "#719451"],
      [14, -43, 20, "#729656"],
      [0, -57, 22, "#89a960"],
      [-4, -42, 23, "#86a65b"],
      [9, -55, 12, "#96b66b"],
    ] as [number, number, number, string][])
      ellipse(c, p[0] + dx, p[1] + dy, r, r * 0.88, col);
    for (const [dx, dy] of [
      [-12, -45],
      [8, -56],
      [13, -35],
      [-3, -32],
    ])
      ellipse(c, p[0] + dx, p[1] + dy, 3, 3.5, "#d88d66");
  } else if (e.kind === "fence") fence(c, 0.15, 0.5, 0.7, 0);
  else if (e.kind === "silo") {
    const p = project(0.5, 0.5);
    ellipse(c, p[0] + 5, p[1] + 2, 23, 10, "#34503924");
    c.fillStyle = "#b3c1bf";
    c.fillRect(p[0] - 17, p[1] - 59, 34, 59);
    ellipse(c, p[0], p[1], 17, 8, "#9eafac");
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.ellipse(p[0], p[1] - i * 12, 17, 8, 0, 0, Math.PI);
      c.strokeStyle = "#8da29c";
      c.lineWidth = 1;
      c.stroke();
    }
    ellipse(c, p[0], p[1] - 59, 17, 8, "#c4cfca");
    polygon(
      c,
      [
        [p[0] - 19, p[1] - 60],
        [p[0], p[1] - 77],
        [p[0] + 19, p[1] - 60],
      ],
      "#749295",
    );
    line(c, [p[0] + 8, p[1] - 54], [p[0] + 8, p[1] - 5], "#eef1de", 2);
    line(c, [p[0] + 13, p[1] - 51], [p[0] + 13, p[1] - 2], "#eef1de", 2);
    for (let i = 0; i < 7; i++)
      line(c, [p[0] + 8, p[1] - 9 - i * 6], [p[0] + 13, p[1] - 6 - i * 6], "#eef1de", 1.5);
  } else if (e.kind === "well") {
    box(c, 0.22, 0.22, 0.56, 0.56, 0, 15, ["#aab6ab", "#8b9b90", "#b1bcae"]);
    tile(c, 0.3, 0.3, 0.4, 0.4, "#497a7d", 16);
    for (const x of [0.25, 0.75])
      box(c, x, 0.47, 0.06, 0.06, 14, 29, ["#b7a47e", "#9e8961", "#b6a27a"]);
    roof(c, 0.1, 0.23, 0.8, 0.55, 43, 12, ["#7c9990", "#99b1a1", "#c2cdb2"]);
  } else if (e.kind === "coop") {
    tile(c, 0.05, 0.05, w - 0.1, h - 0.1, "#bfba82", 1);
    fence(c, 0.08, 0.08, w - 0.16, 0);
    fence(c, w - 0.08, 0.08, 0, h - 0.16);
    box(c, 0.14, 0.15, 0.9, 0.7, 8, 27, ["#e4c088", "#b98e59", "#e0b97e"]);
    roof(c, 0.04, 0.04, 1.1, 0.93, 35, 17, ["#a27854", "#c3996f", "#edd3a4"]);
    front(c, 0.42, 0.85, 0.3, 8, 17, "#795b3e");
    tile(c, 0.42, 0.85, 0.3, 0.46, "#b5905a", 4);
    for (let i = 0; i < e.animals.length; i++) {
      const t = time * 0.0003 + i * 2.3;
      animal(
        c,
        "chicken",
        1.15 + Math.sin(t) * 0.35,
        0.65 + i * 0.28 + Math.cos(t) * 0.13,
        time,
        i,
      );
    }
    fence(c, 0.08, h - 0.08, w - 0.16, 0);
    fence(c, 0.08, 0.9, 0, h - 0.98);
  } else if (e.kind === "mill") {
    tile(c, 0.1, 0.1, 1.8, 1.8, "#c7c4a0", 1);
    box(c, 0.5, 0.5, 1, 1, 0, 72, ["#f1e6c9", "#cfbd9f", "#ede1c0"]);
    roof(c, 0.37, 0.37, 1.26, 1.26, 72, 27, ["#64838c", "#88a0a4", "#d7d2b9"]);
    front(c, 0.82, 1.5, 0.35, 0, 25, "#817961");
    const p = project(1, 1.52, 67);
    c.save();
    c.translate(...p);
    c.rotate(time * 0.00016);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      polygon(
        c,
        [
          [-2, 0],
          [-4, -45],
          [6, -51],
          [7, -17],
        ],
        "#f5ead0",
        "#bbae8a",
      );
      line(c, [0, 0], [0, -46], "#8c8e71", 2);
      for (let j = 0; j < 4; j++) line(c, [-3, -20 - j * 6], [6, -20 - j * 6], "#adab8a", 1);
    }
    ellipse(c, 0, 0, 5, 5, "#a1916b");
    c.restore();
  } else {
    if (e.kind === "barn") {
      // A compact shelter at the back with an open paddock in front.
      tile(c, 0.05, 0.05, w - 0.1, h - 0.1, "#b1b982", 1);
      house(c, e.kind, w, Math.min(1.8, h), time);
      for (let i = 0; i < e.animals.length; i++)
        animal(
          c,
          e.animals[i].species,
          0.45 + i * 0.36,
          h - 0.45 + Math.sin(time * 0.0004 + i) * 0.14,
          time,
          i,
        );
      fence(c, 0.1, h - 0.05, w - 0.2, 0);
      fence(c, w - 0.1, 1.8, 0, Math.max(0.1, h - 1.85));
    } else house(c, e.kind, w, h, time);
  }
  c.restore();
}
const thumbnails = new Map<Kind, string>();
export function thumbnail(kind: Kind): string {
  const cached = thumbnails.get(kind);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 160;
  const c = canvas.getContext("2d");
  if (!c) return "";
  c.translate(120, 65);
  c.scale(0.85, 0.85);
  drawEntity(c, {
    id: 0,
    kind,
    x: 0,
    y: 0,
    rotated: false,
    growth: 30,
    watered: false,
    animals: kind === "coop" ? [{ species: "chicken", fed: 1, ready: 0, progress: 0 }] : [],
    job: null,
    crop: kind === "plot" ? "wheat" : undefined,
  });
  const url = canvas.toDataURL();
  thumbnails.set(kind, url);
  return url;
}
