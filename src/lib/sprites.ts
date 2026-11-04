import { clamp, hex, makeCanvas, mix, rgba, rng, smooth, RGB } from './util';
import type { Strain } from './strains';

export interface Glint {
  x: number; // relativ zum Ursprung, in Einheiten (unit = 1)
  y: number;
  ph: number;
  sz: number;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
  unit: number;
  glints?: Glint[];
}

/* ----------------------------- Cache ----------------------------- */
const cache = new Map<string, Sprite>();
const queue: { key: string; build: () => Sprite }[] = [];
const queued = new Set<string>();

export function getSprite(key: string, build: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = build();
    cache.set(key, s);
    if (cache.size > 800) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
  }
  return s;
}

export function queueSprite(key: string, build: () => Sprite) {
  if (cache.has(key) || queued.has(key) || queue.length > 160) return;
  queued.add(key);
  queue.push({ key, build });
}

export function pumpSprites(budgetMs: number) {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < budgetMs) {
    const q = queue.shift()!;
    queued.delete(q.key);
    if (!cache.has(q.key)) cache.set(q.key, q.build());
  }
}

export function resetSpriteQueue() {
  queue.length = 0;
  queued.clear();
}

/* ----------------------------- Blätter ----------------------------- */
export const COLOR_LEVELS = 14;
export const SHADES = [0.7, 0.84, 0.97, 1.1];

interface Paint {
  mid: RGB;
  edge: RGB;
  tint: RGB;
  tintAmt: number;
  vein: RGB;
  veinHi: RGB;
  shade: number;
  fade: number;
  gloss: number;
}

export function leafColor(s: Strain, t: number): { col: RGB; f: number } {
  const c = s.colors;
  if (t < 0.15) return { col: mix(c.leafYoung, c.leafBase, t / 0.15), f: 0 };
  const f = clamp((t - 0.15) / 0.85);
  const e = f * f * (3 - 2 * f);
  // Zwischenfarbe hält die Sattheit: kein grauer Übergang Grün → Violett
  const bridge = mix(mix(c.leafBase, c.leafFade, 0.5), [24, 58, 30], 0.35);
  const col = e < 0.5 ? mix(c.leafBase, bridge, e * 2) : mix(bridge, c.leafFade, (e - 0.5) * 2);
  return { col, f: e };
}

function makePaint(s: Strain, t: number, shade: number): Paint {
  const { col, f } = leafColor(s, t);
  const young = clamp(1 - t / 0.22);
  return {
    mid: col,
    edge: mix(col, [10, 26, 12], 0.38),
    tint: mix(s.colors.leafEdge, col, 0.16),
    tintAmt: f,
    vein: mix(s.colors.vein, col, 0.3 + 0.4 * f),
    veinHi: mix(s.colors.vein, [255, 255, 240], 0.4),
    shade,
    fade: f,
    gloss: 0.3 + 0.7 * young * (1 - f * 0.8),
  };
}

/**
 * Halbe Blattkontur von der Basis (0,0) zur Spitze (0,-len).
 * Die Ränder sind gesägt: jede Zacke steigt flach an, läuft spitz nach
 * vorn (zur Blattspitze) aus und fällt in einer Kerbe zurück.
 */
function profile(len: number, hw: number, teeth: number, phase: number, round: boolean) {
  const pts: [number, number][] = [];
  if (round) {
    const n = 30;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 0.52), -t * len]);
    }
    pts.push([0, -len]);
    return pts;
  }
  const N = Math.max(5, Math.round(teeth));
  const env = (t: number) => hw * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t), 0.58)), 0.5);
  for (let k = 0; k < N; k++) {
    const a = (k + 0.05 + phase * 0.5) / N;
    const b = (k + 0.38) / N;
    const c = (k + 0.84) / N;
    const d = (k + 1.03) / N;
    const deep = 0.74 + 0.05 * Math.sin(Math.PI * (k / N));
    pts.push([env(a) * deep, -clamp(a) * len]);
    pts.push([env(b) * 0.9, -clamp(b) * len]);
    pts.push([env(c) * 1.05, -clamp(c) * len]);
    pts.push([env(d) * (deep - 0.03), -clamp(d) * len]);
  }
  pts.push([0, -len]);
  return pts;
}

function drawLeaflet(
  ctx: CanvasRenderingContext2D,
  len: number,
  hw: number,
  teeth: number,
  p: Paint,
  rnd: () => number,
  round = false,
) {
  const R = profile(len, hw, teeth, 0, round);
  const L = profile(len, hw, teeth, round ? 0.02 : 0.5, round);
  const path = new Path2D();
  path.moveTo(0, 0);
  for (const q of R) path.lineTo(q[0], q[1]);
  for (let i = L.length - 1; i >= 0; i--) path.lineTo(-L[i][0], L[i][1]);
  path.closePath();

  const sh = p.shade;
  const dark = mix(p.mid, p.edge, 0.62);
  const lit = mix(p.mid, [214, 244, 150], 0.3);

  /* Grundfläche: Licht von links oben, Mittelfalte liegt im Schatten */
  const gx = ctx.createLinearGradient(-hw * 1.2, 0, hw * 1.2, -len * 0.1);
  gx.addColorStop(0, rgba(p.edge, 1, sh * 0.78));
  gx.addColorStop(0.12, rgba(p.mid, 1, sh * 1.02));
  gx.addColorStop(0.36, rgba(mix(p.mid, lit, 0.24), 1, sh * 1.07));
  gx.addColorStop(0.5, rgba(mix(p.mid, dark, 0.32), 1, sh * 0.9));
  gx.addColorStop(0.64, rgba(mix(p.mid, lit, 0.16), 1, sh * 1.0));
  gx.addColorStop(0.88, rgba(p.mid, 1, sh * 0.88));
  gx.addColorStop(1, rgba(p.edge, 1, sh * 0.72));
  ctx.fillStyle = gx;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);

  /* Längsverlauf: Basis dunkler, Spitze heller */
  const lg = ctx.createLinearGradient(0, 0, 0, -len);
  lg.addColorStop(0, 'rgba(0,0,0,0.26)');
  lg.addColorStop(0.22, 'rgba(0,0,0,0.04)');
  lg.addColorStop(0.62, 'rgba(255,255,255,0.02)');
  lg.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = lg;
  ctx.fillRect(-hw * 2, -len * 1.05, hw * 4, len * 1.1);

  /* Verfärbung: Rand, Spitze und Adern laufen in die Herbstfarbe */
  if (p.tintAmt > 0.02) {
    ctx.lineJoin = 'round';
    const rim = (w: number, a: number, k = 1) => {
      ctx.strokeStyle = rgba(p.tint, a * p.tintAmt + a * 0.06, sh * k);
      ctx.lineWidth = w;
      ctx.stroke(path);
    };
    const ta = 1 - 0.28 * p.fade;
    rim(hw * 0.5, 0.16 * ta);
    rim(hw * 0.26, 0.32 * ta, 1.04);
    rim(hw * 0.11, 0.5 * ta, 1.08);
    const tg = ctx.createLinearGradient(0, -len * 0.45, 0, -len);
    tg.addColorStop(0, rgba(p.tint, 0, 1));
    tg.addColorStop(1, rgba(p.tint, 0.5 * p.tintAmt, sh));
    ctx.fillStyle = tg;
    ctx.fillRect(-hw * 2, -len * 1.05, hw * 4, len * 0.6);
  }

  /* Altersflecken / trockene Ränder in der Spätblüte */
  if (p.fade > 0.42) {
    const g = clamp((p.fade - 0.42) / 0.58);
    const n = Math.round(4 + 13 * g);
    for (let i = 0; i < n; i++) {
      const t = 0.15 + rnd() * 0.82;
      const side = rnd() > 0.5 ? 1 : -1;
      const reach = (rnd() * 0.45 + 0.5) * hw * Math.sin(Math.PI * t);
      const x = side * reach;
      const y = -t * len;
      const r = hw * (0.06 + 0.14 * rnd()) * (0.7 + g);
      const brown: RGB = mix([118, 72, 26], p.tint, rnd() * 0.55);
      const bg = ctx.createRadialGradient(x, y, 0, x, y, r);
      bg.addColorStop(0, rgba(brown, 0.5 * g, sh * 0.85));
      bg.addColorStop(0.6, rgba(brown, 0.22 * g, sh * 0.8));
      bg.addColorStop(1, rgba(brown, 0, 1));
      ctx.fillStyle = bg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /* Feine Blattoberfläche */
  const dots = Math.round(clamp(len * 0.16, 10, 46));
  for (let i = 0; i < dots; i++) {
    const t = Math.pow(rnd(), 0.85);
    const x = (rnd() * 2 - 1) * hw * 0.9 * Math.sin(Math.PI * t);
    ctx.fillStyle = rnd() > 0.45 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath();
    ctx.arc(x, -t * len, Math.max(0.7, len * 0.005), 0, Math.PI * 2);
    ctx.fill();
  }
  // leichte Runzel-Struktur entlang der Adern
  if (len > 70) {
    ctx.lineWidth = Math.max(0.6, len * 0.0035);
    for (let i = 0; i < 18; i++) {
      const t = 0.1 + rnd() * 0.8;
      for (const sg of [-1, 1]) {
        const x0 = sg * hw * 0.18 * Math.sin(Math.PI * t);
        const x1 = sg * hw * 0.7 * Math.sin(Math.PI * (t + 0.08));
        ctx.strokeStyle = `rgba(255,255,255,${0.018 + rnd() * 0.02})`;
        ctx.beginPath();
        ctx.moveTo(x0, -t * len);
        ctx.quadraticCurveTo((x0 + x1) * 0.5, -(t + 0.02) * len, x1, -(t + 0.07) * len);
        ctx.stroke();
      }
    }
  }

  /* Seitenadern: enden in den Zahnspitzen */
  const nv = round ? 7 : Math.max(6, Math.round(teeth * 1.05));
  ctx.lineCap = 'round';
  for (let j = 0; j < nv; j++) {
    const t0 = 0.05 + (j / nv) * 0.88;
    const t1 = Math.min(0.99, t0 + 0.14);
    const wx = hw * Math.pow(Math.sin(Math.PI * Math.pow(t1, 0.66)), 0.58) * 0.9;
    for (const sg of [-1, 1]) {
      ctx.strokeStyle = rgba(p.vein, 0.24 * (1 - 0.45 * p.fade), sh * 1.0);
      ctx.lineWidth = Math.max(0.6, len * 0.0042) * (1 - 0.5 * (j / nv));
      ctx.beginPath();
      ctx.moveTo(0, -t0 * len);
      ctx.quadraticCurveTo(sg * wx * 0.55, -(t0 + 0.075) * len, sg * wx, -t1 * len);
      ctx.stroke();
      // feine Gabelung nach vorn
      if (!round && len > 55) {
        ctx.strokeStyle = rgba(p.vein, 0.16, sh);
        ctx.lineWidth = Math.max(0.5, len * 0.0024);
        ctx.beginPath();
        ctx.moveTo(sg * wx * 0.72, -(t0 + 0.085) * len);
        ctx.lineTo(sg * wx * 0.98, -(t0 + 0.175) * len);
        ctx.stroke();
      }
    }
  }

  /* Glanz auf der linken Blatthälfte */
  const gl = ctx.createLinearGradient(-hw, -len * 0.15, -hw * 0.1, -len * 0.5);
  gl.addColorStop(0, `rgba(255,255,255,${0.0 * p.gloss})`);
  gl.addColorStop(0.45, `rgba(255,255,255,${0.07 * p.gloss})`);
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(-hw, -len, hw, len);

  /* Mittelrippe: schmal, hell, mit dunkler Rille rechts */
  const mw = Math.max(0.9, len * 0.0068);
  const mid = new Path2D();
  mid.moveTo(-mw, 0);
  mid.quadraticCurveTo(-mw * 0.6, -len * 0.55, -mw * 0.15, -len * 0.97);
  mid.lineTo(mw * 0.35, -len * 0.97);
  mid.quadraticCurveTo(mw * 0.75, -len * 0.5, mw * 1.15, 0);
  mid.closePath();
  ctx.fillStyle = rgba(p.vein, 0.55, sh * 1.02);
  ctx.fill(mid);
  ctx.fillStyle = rgba(p.veinHi, 0.22 * (0.4 + p.gloss * 0.6), sh);
  ctx.fillRect(-mw * 0.5, -len * 0.88, mw * 0.3, len * 0.84);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(mw * 0.34, -len * 0.84, mw * 0.34, len * 0.8);

  /* weiche Kante innen: hebt die Sägezähne heraus */
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = Math.max(1, hw * 0.1);
  ctx.stroke(path);
  /* Randlicht auf der Lichtseite + dunkle Kontur */
  const rimA = 0.3 * (1 - p.fade * 0.6);
  const rimG = ctx.createLinearGradient(-hw, 0, hw, -len * 0.4);
  rimG.addColorStop(0, `rgba(255,255,235,${rimA})`);
  rimG.addColorStop(0.45, `rgba(255,255,235,${rimA * 0.2})`);
  rimG.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.strokeStyle = rimG;
  ctx.lineWidth = Math.max(0.8, len * 0.006);
  ctx.stroke(path);

  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = Math.max(0.6, len * 0.0035);
  ctx.stroke(path);
  ctx.restore();
}

const PAIRS: Record<number, { l: number[]; spread: number }> = {
  1: { l: [1, 0.85], spread: 40 },
  2: { l: [1, 0.9, 0.62], spread: 32 },
  3: { l: [1, 0.94, 0.78, 0.52], spread: 28 },
  4: { l: [1, 0.95, 0.82, 0.62, 0.4], spread: 27 },
};

function drawStem(ctx: CanvasRenderingContext2D, kind: 'fan' | 'cot' | 'sugar', pet: number, U: number, p: Paint) {
  const w0 = U * (kind === 'cot' ? 0.022 : kind === 'sugar' ? 0.016 : 0.019);
  const w1 = w0 * 0.72;
  const g = ctx.createLinearGradient(-w0, -pet * U, w0 * 0.6, 0);
  g.addColorStop(0, rgba(mix(p.mid, p.vein, 0.35), 1, p.shade * 0.98));
  g.addColorStop(0.45, rgba(mix(p.mid, p.edge, 0.28), 1, p.shade * 0.95));
  g.addColorStop(1, rgba(mix(p.mid, p.edge, 0.65), 1, p.shade * 0.8));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-w0, 0);
  ctx.quadraticCurveTo(-w0 * 0.7, -pet * U * 0.55, -w1, -pet * U);
  ctx.lineTo(w1, -pet * U);
  ctx.quadraticCurveTo(w0 * 0.7, -pet * U * 0.55, w0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(0.6, U * 0.0025);
  ctx.stroke();
}

function drawLeafAssembly(
  ctx: CanvasRenderingContext2D,
  kind: 'fan' | 'cot' | 'sugar',
  leaflets: number,
  width: number,
  p: Paint,
  U: number,
  seed: number,
) {
  const rnd = rng(seed);
  const pet = kind === 'cot' ? 0.13 : kind === 'sugar' ? 0.12 : 0.24;
  drawStem(ctx, kind, pet, U, p);

  const Lc = (1 - pet) * 0.99;
  if (kind === 'cot') {
    ctx.save();
    ctx.translate(0, -pet * U);
    drawLeaflet(ctx, Lc * U, 0.23 * U, 0, p, rnd, true);
    ctx.restore();
    return;
  }

  // kleine Nebenblätter am Blattgrund
  if (kind === 'fan' && leaflets >= 5) {
    for (const sg of [-1, 1]) {
      ctx.save();
      ctx.translate(sg * U * 0.02, -pet * U * 0.95);
      ctx.rotate(sg * 0.95);
      drawLeaflet(ctx, U * 0.1, U * 0.028, 4, { ...p, shade: p.shade * 0.85 }, rnd);
      ctx.restore();
    }
  }

  const k = (leaflets - 1) / 2;
  const cfg = PAIRS[k] ?? { l: [1], spread: 0 };
  for (let j = k; j >= 0; j--) {
    const len = cfg.l[j] * Lc * U * (0.95 + 0.08 * rnd());
    const hw = len * width * 1.55 * (1.06 - 0.12 * (j / Math.max(1, k)));
    const teeth = Math.round(5 + 5 * cfg.l[j] * (len / (Lc * U)));
    const bp = j % 2 === 0 ? 0 : 0.012 * U;
    const shade = p.shade * (0.94 + 0.12 * ((k - j) / Math.max(1, k)));
    const lp: Paint = { ...p, shade };
    if (j === 0) {
      ctx.save();
      ctx.translate(0, -pet * U);
      ctx.transform(1, 0, (rnd() - 0.5) * 0.05, 1, 0, 0);
      drawLeaflet(ctx, len, hw, teeth, lp, rnd);
      ctx.restore();
    } else {
      for (const sg of [-1, 1]) {
        ctx.save();
        ctx.translate(0, -pet * U + bp);
        ctx.rotate(((sg * (j * cfg.spread + (rnd() - 0.5) * 3)) * Math.PI) / 180);
        // leichte Drehung im Raum: Spitze kippt zur Seite
        ctx.transform(1, 0, -sg * (0.04 + 0.05 * rnd()), 1, 0, 0);
        drawLeaflet(ctx, len * (0.98 + 0.04 * rnd()), hw, teeth, { ...lp, shade: shade * (sg < 0 ? 1.03 : 0.95) }, rnd);
        ctx.restore();
      }
    }
  }
}

const LEAF_R = 380;

export function leafKey(s: Strain, variant: number, level: number, shade: number) {
  return `L|${s.id}|${variant}|${level}|${shade}`;
}

export function buildLeaf(s: Strain, variant: number, level: number, shade: number): Sprite {
  const R = LEAF_R;
  const W = Math.ceil(R * 1.3);
  const H = Math.ceil(R * 1.07);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const ox = W / 2;
  const oy = H - R * 0.025;
  ctx.translate(ox, oy);
  const paint = makePaint(s, level / (COLOR_LEVELS - 1), SHADES[shade]);
  if (variant === 0) drawLeafAssembly(ctx, 'cot', 1, 0.23, paint, R, 7);
  else if (variant === 100) drawLeafAssembly(ctx, 'sugar', 3, s.leafWidth * 0.9, paint, R, 5);
  else drawLeafAssembly(ctx, 'fan', variant, s.leafWidth * 1.06, paint, R, 100 + variant * 13);
  return { canvas, ox, oy, unit: R };
}

/* ----------------------------- Blüten ----------------------------- */
export type BudShape = 'cola' | 'side' | 'pop';

interface ShapeCfg {
  maxR: number;
  peak: number;
  pow: number;
  n: number;
  calyx: number;
  pist: number;
  leaves: number;
  trich: number;
}

const SHAPES: Record<BudShape, ShapeCfg> = {
  cola: { maxR: 0.19, peak: 0.33, pow: 0.66, n: 780, calyx: 0.035, pist: 0, leaves: 7, trich: 1 },
  side: { maxR: 0.21, peak: 0.4, pow: 0.68, n: 590, calyx: 0.04, pist: 0, leaves: 5, trich: 1 },
  pop: { maxR: 0.3, peak: 0.5, pow: 0.72, n: 380, calyx: 0.05, pist: 0, leaves: 3, trich: 1 },
};

export const BUD_LEVELS = 12;

export function budKey(s: Strain, shape: BudShape, variant: number, tier: number, level: number) {
  return `B|${s.id}|${shape}|${variant}|${tier}|${level}`;
}

export function buildBud(s: Strain, shape: BudShape, variant: number, tier: number, level: number): Sprite {
  const cfg = SHAPES[shape];
  const U = tier;
  const r = level / (BUD_LEVELS - 1); // Reife 0..1
  const rnd = rng(s.seed * 1000 + variant * 77 + (shape === 'cola' ? 1 : shape === 'side' ? 2 : 3));
  const W = Math.ceil(U * (cfg.maxR * 2 + 0.78));
  const Hc = Math.ceil(U * 1.3);
  const canvas = makeCanvas(W, Hc);
  const ctx = canvas.getContext('2d')!;
  const ox = W / 2;
  const oy = Hc - U * 0.1;
  ctx.translate(ox, oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const colors = s.colors;
  const e = Math.log(0.5) / Math.log(cfg.peak);
  const rad = (t: number) => cfg.maxR * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t), e) * 0.98 + 0.02), cfg.pow);

  /* Stielansatz */
  ctx.strokeStyle = rgba(mix(colors.stem, [30, 40, 20], 0.35), 1);
  ctx.lineWidth = U * 0.042;
  ctx.beginPath();
  ctx.moveTo(0, U * 0.1);
  ctx.lineTo(0, -U * 0.04);
  ctx.stroke();

  /* Silhouette (als weicher Schattenuntergrund und für die Belichtung) */
  const silhouette = new Path2D();
  {
    const steps = 30;
    silhouette.moveTo(0, U * 0.04);
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps;
      silhouette.lineTo(rad(tt) * U * 0.97, -tt * U * 1.01);
    }
    for (let i = steps; i >= 0; i--) {
      const tt = i / steps;
      silhouette.lineTo(-rad(tt) * U * 0.97, -tt * U * 1.01);
    }
    silhouette.closePath();
  }
  {
    const dark = mix(mix(colors.calyxA, colors.calyxB, r * 0.55), [12, 18, 10], 0.55);
    const bg = ctx.createLinearGradient(0, 0, 0, -U);
    bg.addColorStop(0, rgba(dark, 1, 0.7));
    bg.addColorStop(1, rgba(dark, 1, 0.92));
    ctx.fillStyle = bg;
    ctx.fill(silhouette);
  }

  type Item =
    | {
        z: number;
        k: 'c';
        x: number;
        y: number;
        sz: number;
        lean: number;
        t: number;
        base: RGB;
        light: number;
        z3: number;
      }
    | { z: number; k: 'p'; x: number; y: number; ang: number; len: number; col: RGB; bend: number }
    | { z: number; k: 'l'; x: number; y: number; ang: number; sz: number; dark: number };
  const items: Item[] = [];
  const bracts: Extract<Item, { k: 'c' }>[] = [];

  for (let i = 0; i < cfg.n; i++) {
    const t = Math.pow(rnd(), 0.82) * 0.96 + 0.02;
    const phi = rnd() * Math.PI * 2;
    const rt = rad(t);
    const band = 0.45 + 0.55 * Math.pow(rnd(), 0.5);
    const rr = rt * band;
    const x = rr * Math.sin(phi);
    const z3 = rr * Math.cos(phi);
    const y = -t + (rnd() - 0.5) * 0.016;
    // Bracts an der Oberfläche sind größer, tiefe kleiner
    const sz =
      cfg.calyx *
      (0.72 + 0.5 * rnd()) *
      (0.82 + 0.28 * (rt / cfg.maxR)) *
      (0.88 + 0.24 * r) *
      (0.72 + 0.42 * band);
    const lean = (x / Math.max(rt, 0.02)) * (0.85 + 0.5 * rnd()) + (rnd() - 0.5) * 0.55;
    // Farbstreuung: grün → Endfarbe, mit weichem Übergang statt harter Zweifarbigkeit
    const patch = 0.5 + 0.5 * Math.sin(x * 9.1 + z3 * 7.3 + t * 11.7 + variant * 2.1);
    const vv = clamp(patch * 0.62 + rnd() * 0.38);
    // scharfer Übergang: jede Bract ist grün ODER violett (kein grauer Mischbrei)
    const raw = clamp(r * 0.95 * (0.55 + 0.5 * vv) + (vv - 0.5) * 0.1 + (shape === 'pop' ? 0.03 : 0));
    const m = smooth((raw - 0.37) / 0.24);
    let base = mix(colors.calyxA, colors.calyxB, m);
    base = mix(base, [64, 96, 44], (1 - r) * 0.08);
    // Beleuchtung: Licht von links oben, Oberflächennormale aus der Zylinderposition
    const nx = Math.sin(phi) * band;
    const nz = Math.cos(phi) * band;
    const ny = 0.42;
    const dot = nx * -0.42 + ny * 0.5 + nz * 0.76;
    const light = 0.6 + 0.42 * Math.max(0, dot) + 0.1 * (0.5 + 0.5 * nz);
    const br = { z: z3, k: 'c' as const, x, y, sz, lean, t, base, light, z3 };
    bracts.push(br);
    items.push(br);
  }

  /* Fruchtblätter: Härchen entspringen den Spitzen der oberflächlichen Bracts */
  const pistN = Math.round((shape === 'cola' ? 104 : shape === 'side' ? 76 : 44) * (0.6 + 0.4 * r));
  const surface = bracts.filter((b) => b.z3 > 0.16 * cfg.maxR && b.t > 0.1);
  for (let i = 0; i < pistN && surface.length; i++) {
    const b = surface[(rnd() * surface.length) | 0];
    const tipx = b.x + Math.sin(b.lean) * b.sz * 1.05;
    const tipy = b.y - Math.cos(b.lean) * b.sz * 1.05;
    const out = Math.atan2(b.x, 1.1) + (rnd() - 0.5) * 0.6;
    const m2 = clamp(r * 1.35 + (rnd() - 0.5) * 0.4 + 0.05);
    const col = mix(colors.pistilA, colors.pistilB, m2);
    const strands = rnd() < 0.6 ? 2 : 1;
    for (let q = 0; q < strands; q++) {
      items.push({
        z: b.z3 + 0.004,
        k: 'p',
        x: tipx + (rnd() - 0.5) * b.sz * 0.5,
        y: tipy + (rnd() - 0.5) * b.sz * 0.3,
        ang: out + (q === 0 ? -0.2 : 0.2) + (rnd() - 0.5) * 0.35,
        len: (0.013 + 0.018 * rnd()) * (shape === 'pop' ? 0.9 : 1),
        col,
        bend: (rnd() - 0.5) * 3.4,
      });
    }
  }

  /* Zuckerblätter: klein, aufrecht, an den Flanken der Blüte */
  for (let i = 0; i < cfg.leaves; i++) {
    const t = 0.05 + 0.8 * (i / cfg.leaves) + rnd() * 0.04;
    const sg = i % 2 === 0 ? -1 : 1;
    const rt = rad(t);
    items.push({
      z: (rnd() - 0.62) * cfg.maxR * 2.2,
      k: 'l',
      x: sg * rt * (0.7 + 0.3 * rnd()),
      y: -t,
      ang: sg * (0.1 + 0.34 * rnd()),
      sz: (0.09 + 0.075 * (1 - t) + 0.025 * rnd()) * (shape === 'pop' ? 0.85 : 1),
      dark: 0.25 + 0.45 * rnd(),
    });
  }

  items.sort((a, b) => a.z - b.z);

  const glints: Glint[] = [];
  const leafT = clamp(0.1 + r * 0.32 * s.fadeMax, 0, 1);
  const leafPaint = makePaint(s, leafT, 0.9);
  const trichDen = 0.3 + 0.7 * r;

  const trichome = (cx: number, cy: number, ang: number, scale: number) => {
    const L = U * (0.007 + 0.008 * rnd()) * scale;
    const hr = U * (0.0016 + 0.0014 * rnd()) * scale;
    const ex = cx + Math.cos(ang) * L;
    const ey = cy + Math.sin(ang) * L;
    ctx.strokeStyle = 'rgba(232,245,228,0.45)';
    ctx.lineWidth = Math.max(0.7, U * 0.001);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const v = r * 0.95 + (rnd() - 0.5) * 0.5;
    let fill: string;
    if (v < 0.32) fill = 'rgba(214,240,250,0.55)';
    else if (v < 1.05) fill = 'rgba(255,255,255,0.85)';
    else fill = 'rgba(232,160,64,0.95)';
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(ex, ey, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ex - hr * 0.3, ey - hr * 0.3, hr * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawPistil = (x: number, y: number, ang: number, len: number, col: RGB, bend: number) => {
    const dx = Math.sin(ang);
    const dy = -Math.cos(ang);
    const nx = -dy;
    const ny = dx;
    const c1x = x + dx * len * 0.4 + nx * bend * len * 0.22;
    const c1y = y + dy * len * 0.4 + ny * bend * len * 0.22;
    const ex = x + dx * len * 0.95 + nx * bend * len * 0.42;
    const ey = y + dy * len * 0.95 + ny * bend * len * 0.42;
    const w0 = U * 0.0011;
    const ptsL: [number, number][] = [];
    const ptsR: [number, number][] = [];
    const steps = 7;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      const bx = it * it * x + 2 * it * t * c1x + t * t * ex;
      const by = it * it * y + 2 * it * t * c1y + t * t * ey;
      const tx = 2 * it * (c1x - x) + 2 * t * (ex - c1x);
      const ty = 2 * it * (c1y - y) + 2 * t * (ey - c1y);
      const ml = Math.hypot(tx, ty) || 1;
      const px = -ty / ml;
      const py = tx / ml;
      const w = w0 * (1 - 0.82 * t) + U * 0.0004;
      ptsL.push([bx + px * w, by + py * w]);
      ptsR.push([bx - px * w, by - py * w]);
    }
    const p = new Path2D();
    p.moveTo(ptsL[0][0], ptsL[0][1]);
    for (const q of ptsL) p.lineTo(q[0], q[1]);
    for (let i = ptsR.length - 1; i >= 0; i--) p.lineTo(ptsR[i][0], ptsR[i][1]);
    p.closePath();
    const g = ctx.createLinearGradient(x, y, ex, ey);
    g.addColorStop(0, rgba(mix(col, [120, 80, 30], 0.3), 1, 0.85));
    g.addColorStop(0.5, rgba(col, 1, 1.02));
    g.addColorStop(1, rgba(mix(col, [255, 250, 230], 0.25), 0.95, 1.05));
    ctx.fillStyle = g;
    ctx.fill(p);
  };

  for (const it of items) {
    if (it.k === 'c') {
      const sz = it.sz * U;
      ctx.save();
      ctx.translate(it.x * U, it.y * U);
      ctx.rotate(it.lean);
      // Schattenfuge am Bract-Grund
      const shg = ctx.createRadialGradient(0, sz * 0.5, sz * 0.1, 0, sz * 0.35, sz * 1.1);
      shg.addColorStop(0, 'rgba(0,0,0,0.34)');
      shg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shg;
      ctx.beginPath();
      ctx.ellipse(0, sz * 0.5, sz * 0.95, sz * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Kelch: breiter Grund, spitz zulaufender Kopf
      const p = new Path2D();
      p.moveTo(0, sz * 0.88);
      p.bezierCurveTo(sz * 0.8, sz * 0.32, sz * 0.68, -sz * 0.68, sz * 0.04, -sz * 1.34);
      p.bezierCurveTo(-sz * 0.6, -sz * 0.72, -sz * 0.82, sz * 0.3, 0, sz * 0.88);
      p.closePath();

      const k = it.light;
      const hp: RGB = mix(it.base, mix([250, 250, 238], colors.calyxLight, 0.35), 0.1 + 0.08 * (1 - r));
      const g = ctx.createRadialGradient(-sz * 0.2, -sz * 0.72, sz * 0.04, 0, -sz * 0.2, sz * 1.35);
      g.addColorStop(0, rgba(hp, 1, k * 1.02));
      g.addColorStop(0.3, rgba(it.base, 1, k));
      g.addColorStop(0.8, rgba(mix(it.base, [10, 18, 8], 0.26), 1, k * 0.82));
      g.addColorStop(1, rgba(mix(it.base, [8, 14, 6], 0.55), 1, k * 0.68));
      ctx.fillStyle = g;
      ctx.fill(p);
      ctx.strokeStyle = rgba(mix(it.base, [0, 0, 0], 0.62), 0.32, k);
      ctx.lineWidth = Math.max(0.6, U * 0.0012);
      ctx.stroke(p);

      // Harzglanz auf der Bract-Spitze
      ctx.save();
      ctx.clip(p);
      const hg = ctx.createRadialGradient(-sz * 0.3, -sz * 0.8, 0, -sz * 0.3, -sz * 0.8, sz * 0.85);
      hg.addColorStop(0, `rgba(255,255,255,${0.03 + 0.04 * r})`);
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(-sz * 1.4, -sz * 1.6, sz * 2.8, sz * 3.2);

      // feine Farbsprenkel
      for (let q = 0; q < 3; q++) {
        const sx0 = (rnd() - 0.5) * sz * 1.2;
        const sy0 = (rnd() - 0.5) * sz * 1.8 - sz * 0.2;
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
        ctx.beginPath();
        ctx.ellipse(sx0, sy0, sz * (0.12 + 0.2 * rnd()), sz * (0.2 + 0.3 * rnd()), rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trichome auf dem Bract
      const nt = Math.round((2 + (4 + 6 * rnd()) * trichDen) * cfg.trich * (0.6 + 0.8 * it.light));
      for (let j = 0; j < nt; j++) {
        const a = rnd() * Math.PI * 2;
        const rd = Math.sqrt(rnd()) * 0.8;
        const px = Math.cos(a) * sz * 0.7 * rd;
        const py = Math.sin(a) * sz * 1.0 * rd - sz * 0.25;
        const dirA = Math.atan2(py, px) + (rnd() - 0.5) * 0.9;
        trichome(px, py, dirA, 0.95);
      }
      ctx.restore();

      if (glints.length < 46 && rnd() < 0.035 * (0.25 + r)) {
        const wx = it.x * U + -sz * 0.2;
        const wy = it.y * U + -sz * 0.55;
        glints.push({ x: wx / U, y: wy / U, ph: rnd() * 10, sz: 0.55 + rnd() * 0.7 });
      }
      ctx.restore();
    } else if (it.k === 'p') {
      drawPistil(it.x * U, it.y * U, it.ang, it.len * U, it.col, it.bend);
    } else {
      const S = it.sz * U;
      ctx.save();
      ctx.translate(it.x * U, it.y * U);
      ctx.rotate(it.ang);
      const lp: Paint = {
        ...leafPaint,
        mid: mix(leafPaint.mid, [24, 46, 20], it.dark * 0.6),
        edge: mix(leafPaint.edge, [10, 20, 8], 0.4),
      };
      drawLeafAssembly(ctx, 'sugar', 3, s.leafWidth * 0.8, lp, S, 5 + ((it.sz * 100) | 0));
      // Harzfrost auf dem Zuckerblatt
      const nf = Math.round(26 * trichDen + 6);
      for (let j = 0; j < nf; j++) {
        const yy = -S * (0.15 + 0.78 * rnd());
        const xx = (rnd() - 0.5) * S * 0.34 * (1 - Math.abs(yy / S) * 0.5);
        trichome(xx, yy, rnd() * Math.PI * 2, 0.75);
      }
      ctx.restore();
    }
  }

  /* Harzfrost und Licht */
  ctx.save();
  ctx.clip(silhouette);
  // weiche Kantenabdunklung für Volumen
  const vig = ctx.createRadialGradient(-U * 0.02, -U * 0.55, U * 0.05, 0, -U * 0.45, U * 0.72);
  vig.addColorStop(0, 'rgba(255,255,255,0)');
  vig.addColorStop(0.62, 'rgba(0,0,0,0.04)');
  vig.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(-U, -U * 1.1, U * 2, U * 1.2);

  // Froststaub
  const nfr = Math.round(700 + 1400 * r);
  for (let i = 0; i < nfr; i++) {
    const t = 0.02 + rnd() * 0.94;
    const x = (rnd() * 2 - 1) * rad(t) * 0.92;
    const y = -t * U;
    const rr = U * (0.0004 + 0.0011 * rnd());
    ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.22 * rnd() * (0.3 + r)})`;
    ctx.beginPath();
    ctx.arc(x * U, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  // Schimmer oben links
  const sheen = ctx.createRadialGradient(-U * 0.1, -U * 0.78, 0, -U * 0.1, -U * 0.78, U * 0.6);
  sheen.addColorStop(0, `rgba(255,255,240,${0.07 + 0.07 * r})`);
  sheen.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-U, -U * 1.1, U, U);
  ctx.restore();

  return { canvas, ox, oy, unit: U, glints };
}

/* ----------------------------- Glitzer ----------------------------- */
let glintSprite: HTMLCanvasElement | null = null;
export function getGlintSprite() {
  if (glintSprite) return glintSprite;
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  for (let i = 0; i < 2; i++) {
    ctx.rotate(i * Math.PI * 0.25);
    const lg = ctx.createLinearGradient(-S / 2, 0, S / 2, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(-S / 2, 0);
    ctx.lineTo(0, -S * 0.025);
    ctx.lineTo(S / 2, 0);
    ctx.lineTo(0, S * 0.025);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-S / 2, 0);
    ctx.lineTo(0, -S * 0.025);
    ctx.lineTo(S / 2, 0);
    ctx.lineTo(0, S * 0.025);
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-Math.PI / 2);
  }
  glintSprite = c;
  return c;
}

export function seedColor() {
  return hex('#6b4a2c');
}
