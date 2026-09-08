import { drawEntity, ellipse, type Point, polygon, project, tile, unproject } from "./art";
import { type Kind, SIZE } from "./data";
import { dimensions, type Entity, type Farm, fits, land, progress } from "./model";

export interface Ghost {
  kind: Kind;
  x: number;
  y: number;
  rotated: boolean;
  id?: number;
}
const noise = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export class World {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  zoom = 1;
  pan: Point = [0, 0];
  base = 1;
  mobile: boolean | null = null;
  selected: number | null = null;
  grid = false;
  ghost: Ghost | null = null;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A 2D canvas is needed to render the valley.");
    this.context = context;
  }
  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const mobile = window.innerWidth <= 700;
    if (this.mobile !== mobile) {
      this.mobile = mobile;
      this.zoom = mobile ? 1.9 : 1;
      this.pan = [0, 0];
    }
    this.width = r.width;
    this.height = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.base = Math.min((this.width - 30) / 1050, (this.height - 120) / 650);
    this.base = Math.max(0.32, this.base);
  }
  scale(): number {
    return this.base * this.zoom;
  }
  origin(): Point {
    return [this.width * 0.5 + this.pan[0], Math.max(45, this.height * 0.16) + this.pan[1]];
  }
  screen(x: number, y: number, z = 0): Point {
    const p = project(x, y, z),
      o = this.origin(),
      s = this.scale();
    return [o[0] + p[0] * s, o[1] + p[1] * s];
  }
  cell(px: number, py: number): Point {
    const o = this.origin(),
      s = this.scale(),
      p = unproject((px - o[0]) / s, (py - o[1]) / s);
    return [Math.floor(p[0]), Math.floor(p[1])];
  }
  zoomAt(factor: number, px = this.width / 2, py = this.height / 2): void {
    const before = this.scale(),
      o = this.origin();
    this.zoom = Math.min(3.8, Math.max(0.7, this.zoom * factor));
    const ratio = this.scale() / before;
    this.pan[0] += (px - o[0]) * (1 - ratio);
    this.pan[1] += (py - o[1]) * (1 - ratio);
    this.clamp();
  }
  clamp(): void {
    const limit = 600 * this.scale();
    this.pan[0] = Math.max(-limit, Math.min(limit, this.pan[0]));
    this.pan[1] = Math.max(-limit, Math.min(limit, this.pan[1]));
  }
  fit(): void {
    this.zoom = 1;
    this.pan = [0, 0];
  }
  entityPoint(e: Entity): Point {
    const [w, h] = dimensions(e.kind, e.rotated);
    const z =
      e.kind === "plot" || e.kind === "path" || e.kind === "fence"
        ? 4
        : e.kind === "tree"
          ? 50
          : e.kind === "coop"
            ? 36
            : 70;
    return this.screen(e.x + w / 2, e.y + h / 2, z);
  }
  draw(s: Farm, time: number): void {
    const c = this.context,
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    const gradient = c.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#e9efde");
    gradient.addColorStop(1, "#d8e7d0");
    c.fillStyle = gradient;
    c.fillRect(0, 0, this.width, this.height);
    c.save();
    c.translate(...this.origin());
    c.scale(this.scale(), this.scale());
    // The stream, bank and drifting ripples are painted independently of the buildable island.
    c.lineCap = "round";
    c.lineJoin = "round";
    const river = () => {
      c.beginPath();
      c.moveTo(-850, 390);
      c.bezierCurveTo(-420, 330, -700, 80, -160, 16);
      c.bezierCurveTo(130, -5, 260, 25, 670, -80);
    };
    river();
    c.strokeStyle = "#cfdec0";
    c.lineWidth = 154;
    c.stroke();
    river();
    c.strokeStyle = "#a4cdd0";
    c.lineWidth = 112;
    c.stroke();
    river();
    c.strokeStyle = "#b1d5d2";
    c.lineWidth = 79;
    c.stroke();
    for (let i = 0; i < 16; i++) {
      const x = -540 + i * 68,
        y = 20 + Math.sin(i * 0.9) * 17;
      c.strokeStyle = "#eef8e45e";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + ((time * 0.007) % 28), y);
      c.lineTo(x + 17 + ((time * 0.007) % 28), y);
      c.stroke();
    }
    ellipse(c, 4, 324, 510, 233, "#5e774126");
    for (let depth = 0; depth < SIZE * 2; depth++)
      for (let x = 0; x < SIZE; x++) {
        const y = depth - x;
        if (!land(x, y)) continue;
        if (!land(x + 1, y)) {
          polygon(
            c,
            [
              project(x + 1, y),
              project(x + 1, y + 1),
              project(x + 1, y + 1, -21),
              project(x + 1, y, -21),
            ],
            "#a7aa77",
          );
        }
        if (!land(x, y + 1)) {
          polygon(
            c,
            [
              project(x, y + 1),
              project(x + 1, y + 1),
              project(x + 1, y + 1, -21),
              project(x, y + 1, -21),
            ],
            "#b8b786",
          );
        }
        const shades = ["#a9bf80", "#aec486", "#b1c689", "#a6bd7d", "#afc586"];
        tile(
          c,
          x,
          y,
          1,
          1,
          shades[Math.floor(noise(x, y) * shades.length)],
          0,
          this.grid ? "#edf1c64d" : undefined,
        );
        if (noise(y, x) > 0.55) {
          const p = project(x + 0.2, y + 0.4);
          ellipse(c, ...p, 2, 1, "#d5ddae");
        }
      }
    // Sparse wildflowers along the bank give the map a softer, lived-in edge.
    for (let i = 0; i < 48; i++) {
      const x = Math.floor(noise(i, 2) * SIZE),
        y = Math.floor(noise(i, 3) * SIZE);
      if (!land(x, y) || s.entities.some((e) => e.x === x && e.y === y)) continue;
      const p = project(x + noise(i, 4), y + noise(i, 5));
      ellipse(c, p[0], p[1] - 2, 1.4, 2, i % 3 ? "#e9e6b7" : "#d9bca5");
    }
    const sorted = [...s.entities].sort((a, b) => {
      const [aw, ah] = dimensions(a.kind, a.rotated),
        [bw, bh] = dimensions(b.kind, b.rotated);
      return a.x + a.y + (aw + ah) / 2 - (b.x + b.y + (bw + bh) / 2);
    });
    for (const e of sorted) {
      if (e.id === this.selected) {
        const [w, h] = dimensions(e.kind, e.rotated);
        tile(c, e.x, e.y, w, h, "#fff5bc66", 1, "#fffcef");
      }
      drawEntity(c, e, time);
      if (progress(e) >= 1 && e.kind !== "path") {
        const [w, h] = dimensions(e.kind, e.rotated),
          p = project(e.x + w / 2, e.y + h / 2, e.kind === "plot" ? 34 : 88);
        c.save();
        c.translate(p[0], p[1] + Math.sin(time * 0.003 + e.id) * 2);
        ellipse(c, 0, 0, 9, 9, "#fff8d9");
        c.strokeStyle = "#bb9253";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-3, 0);
        c.lineTo(-0.5, 2.5);
        c.lineTo(4, -3);
        c.stroke();
        c.restore();
      }
    }
    if (this.ghost) {
      const g = this.ghost,
        [w, h] = dimensions(g.kind, g.rotated),
        valid = fits(s, g.kind, g.x, g.y, g.rotated, g.id);
      tile(c, g.x, g.y, w, h, valid ? "#e7ffc399" : "#f3948199", 2, valid ? "#f4ffe7" : "#b95143");
      const original = s.entities.find((e) => e.id === g.id);
      drawEntity(
        c,
        {
          id: -1,
          kind: g.kind,
          growth: 0,
          watered: false,
          animals: [],
          job: null,
          ...original,
          x: g.x,
          y: g.y,
          rotated: g.rotated,
        },
        time,
        true,
      );
    }
    // A few petals drift across the scene; the simulation itself does not depend on animation.
    for (let i = 0; i < 7; i++) {
      const x = ((time * 0.013 + i * 151) % 1100) - 550,
        y = 80 + ((time * 0.007 + i * 53) % 430);
      ellipse(c, x, y, 2.7, 1.2, "#f6f1cda0");
    }
    c.restore();
  }
}
