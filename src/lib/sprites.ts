import { clamp, hex, makeCanvas, mix, rgba, rng, RGB } from './util';
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
  shade: number;
}

export function leafColor(s: Strain, t: number): { col: RGB; f: number } {
  const c = s.colors;
  if (t < 0.15) return { col: mix(c.leafYoung, c.leafBase, t / 0.15), f: 0 };
  const f = clamp((t - 0.15) / 0.85);
  const e = f * f * (3 - 2 * f);
  return { col: mix(c.leafBase, c.leafFade, e), f: e };
}

function makePaint(s: Strain, t: number, shade: number): Paint {
  const { col, f } = leafColor(s, t);
  return {
    mid: col,
    edge: mix(col, [8, 22, 8], 0.2),
    tint: mix(col, s.colors.leafEdge, 0.85),
    tintAmt: f,
    vein: mix(s.colors.vein, col, f * 0.35 + (t < 0.15 ? 0.1 : 0)),
    shade,
  };
}

function profile(len: number, hw: number, teeth: number, phase: number, round: boolean) {
  const pts: [number, number][] = [];
  if (round) {
    const n = 26;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push([hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.6), -t * len]);
    }
    pts.push([0, -len]);
    return pts;
  }
  const amp = hw * 0.24;
  const sub = 4;
  for (let k = 0; k < teeth; k++) {
    for (let j = 0; j <= sub; j++) {
      const f = j / sub;
      const t = clamp((k + f * 0.9 + phase) / (teeth + 0.4));
      const base = hw * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.85);
      const tooth = amp * f * Math.pow(Math.sin(Math.PI * t), 0.55);
      pts.push([Math.max(0, base + tooth), -t * len]);
    }
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
  const L = profile(len, hw, teeth, 0.45, round);
  const half = (pts: [number, number][], sg: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const q of pts) ctx.lineTo(sg * q[0], q[1]);
    ctx.closePath();
  };
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const q of R) ctx.lineTo(q[0], q[1]);
    for (let i = L.length - 1; i >= 0; i--) ctx.lineTo(-L[i][0], L[i][1]);
    ctx.closePath();
  };

  for (const sg of [-1, 1]) {
    half(sg < 0 ? L : R, sg);
    const g = ctx.createLinearGradient(0, 0, sg * hw * 1.3, 0);
    const k = sg < 0 ? 1.1 : 0.88;
    g.addColorStop(0, rgba(p.mid, 1, p.shade * k * 1.12));
    g.addColorStop(0.5, rgba(p.mid, 1, p.shade * k * 0.92));
    g.addColorStop(1, rgba(mix(p.mid, p.edge, 0.6), 1, p.shade * k * 0.72));
    ctx.fillStyle = g;
    ctx.fill();
  }

  ctx.save();
  outline();
  ctx.clip();

  // Längsverlauf: Basis dunkler, Spitze heller
  const lg = ctx.createLinearGradient(0, 0, 0, -len);
  lg.addColorStop(0, 'rgba(0,0,0,0.32)');
  lg.addColorStop(0.4, 'rgba(0,0,0,0)');
  lg.addColorStop(1, 'rgba(255,255,255,0.07)');
  ctx.fillStyle = lg;
  ctx.fillRect(-hw * 2, -len * 1.05, hw * 4, len * 1.1);

  // Verfärbung am Rand / an der Spitze
  if (p.tintAmt > 0.02) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(p.tint, 0.22 * p.tintAmt + 0.05, p.shade);
    ctx.lineWidth = hw * 0.9;
    outline();
    ctx.stroke();
    ctx.strokeStyle = rgba(p.tint, 0.4 * p.tintAmt, p.shade);
    ctx.lineWidth = hw * 0.42;
    outline();
    ctx.stroke();
    ctx.strokeStyle = rgba(p.tint, 0.55 * p.tintAmt, p.shade * 1.05);
    ctx.lineWidth = hw * 0.16;
    outline();
    ctx.stroke();
    // Spitze stärker gefärbt
    const tg = ctx.createLinearGradient(0, -len * 0.5, 0, -len);
    tg.addColorStop(0, rgba(p.tint, 0, 1));
    tg.addColorStop(1, rgba(p.tint, 0.5 * p.tintAmt, p.shade));
    ctx.fillStyle = tg;
    ctx.fillRect(-hw * 2, -len * 1.05, hw * 4, len * 0.6);
  }

  // Seitenadern
  const nv = round ? 6 : 11;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(p.vein, 0.4, p.shade);
  ctx.lineWidth = Math.max(1, len * 0.0075);
  for (let j = 0; j < nv; j++) {
    const t0 = 0.06 + j * (0.84 / nv);
    const t1 = Math.min(0.97, t0 + 0.17);
    const wx = hw * Math.pow(Math.sin(Math.PI * Math.pow(t1, 0.8)), 0.85) * 0.92;
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, -t0 * len);
      ctx.quadraticCurveTo(sg * wx * 0.6, -(t0 + 0.07) * len, sg * wx, -t1 * len);
      ctx.stroke();
    }
  }
  // feine Blattstruktur
  for (let i = 0; i < 40; i++) {
    const t = rnd();
    const x = (rnd() * 2 - 1) * hw * 0.85 * Math.sin(Math.PI * t);
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    ctx.beginPath();
    ctx.arc(x, -t * len, Math.max(0.8, len * 0.006), 0, Math.PI * 2);
    ctx.fill();
  }
  // Glanz links
  half(L, -1);
  const gl = ctx.createLinearGradient(0, 0, -hw, 0);
  gl.addColorStop(0, 'rgba(255,255,255,0.0)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fill();
  ctx.restore();

  // Mittelrippe
  ctx.fillStyle = rgba(p.vein, 0.92, p.shade * 1.05);
  const w = Math.max(1.2, len * 0.013);
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(0, -len * 0.97);
  ctx.lineTo(w, 0);
  ctx.closePath();
  ctx.fill();
  // feine dunkle Kontur
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(0.8, len * 0.004);
  outline();
  ctx.stroke();
}

const PAIRS: Record<number, { l: number[]; spread: number }> = {
  1: { l: [1, 0.85], spread: 40 },
  2: { l: [1, 0.9, 0.62], spread: 32 },
  3: { l: [1, 0.94, 0.78, 0.52], spread: 28 },
  4: { l: [1, 0.95, 0.82, 0.62, 0.4], spread: 27 },
};

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
  const pet = kind === 'cot' ? 0.12 : kind === 'sugar' ? 0.1 : 0.27;
  // Blattstiel
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(mix(p.mid, p.vein, 0.55), 1, p.shade * 0.95);
  ctx.lineWidth = Math.max(1.5, U * (kind === 'cot' ? 0.03 : 0.022));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -pet * U);
  ctx.stroke();

  const Lc = (1 - pet) * 0.985;
  if (kind === 'cot') {
    ctx.save();
    ctx.translate(0, -pet * U);
    drawLeaflet(ctx, Lc * U, 0.2 * U, 0, p, rnd, true);
    ctx.restore();
    return;
  }
  const k = (leaflets - 1) / 2;
  const cfg = PAIRS[k] ?? { l: [1], spread: 0 };
  for (let j = k; j >= 0; j--) {
    const len = cfg.l[j] * Lc * U * (0.95 + 0.08 * rnd());
    const hw = len * width * (1.08 - 0.12 * (j / Math.max(1, k)));
    const teeth = Math.round(6 + 9 * cfg.l[j] * (len / (Lc * U)));
    if (j === 0) {
      ctx.save();
      ctx.translate(0, -pet * U);
      drawLeaflet(ctx, len, hw, teeth, p, rnd);
      ctx.restore();
    } else {
      for (const sg of [-1, 1]) {
        ctx.save();
        ctx.translate(0, -pet * U);
        ctx.rotate(((sg * (j * cfg.spread + (rnd() - 0.5) * 4)) * Math.PI) / 180);
        drawLeaflet(ctx, len, hw, teeth, p, rnd);
        ctx.restore();
      }
    }
  }
}

const LEAF_R = 340;

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
  if (variant === 0) drawLeafAssembly(ctx, 'cot', 1, 0.2, paint, R, 7);
  else if (variant === 100) drawLeafAssembly(ctx, 'sugar', 3, s.leafWidth * 0.8, paint, R, 5);
  else drawLeafAssembly(ctx, 'fan', variant, s.leafWidth, paint, R, 100 + variant * 13);
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
  cola: { maxR: 0.15, peak: 0.36, pow: 0.7, n: 560, calyx: 0.03, pist: 110, leaves: 9, trich: 1 },
  side: { maxR: 0.17, peak: 0.4, pow: 0.7, n: 380, calyx: 0.036, pist: 80, leaves: 7, trich: 1 },
  pop: { maxR: 0.28, peak: 0.5, pow: 0.75, n: 220, calyx: 0.05, pist: 44, leaves: 4, trich: 1 },
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
  const W = Math.ceil(U * (cfg.maxR * 2 + 0.85));
  const Hc = Math.ceil(U * 1.32);
  const canvas = makeCanvas(W, Hc);
  const ctx = canvas.getContext('2d')!;
  const ox = W / 2;
  const oy = Hc - U * 0.14;
  ctx.translate(ox, oy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const colors = s.colors;
  const e = Math.log(0.5) / Math.log(cfg.peak);
  const rad = (t: number) =>
    cfg.maxR * Math.pow(Math.sin(Math.PI * Math.pow(clamp(t), e) * 0.98 + 0.02), cfg.pow);

  // Stielansatz
  ctx.strokeStyle = rgba(mix(colors.stem, [30, 40, 20], 0.3), 1);
  ctx.lineWidth = U * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, U * 0.09);
  ctx.lineTo(0, -U * 0.03);
  ctx.stroke();

  // dunkle Silhouette als Untergrund
  {
    const dark = mix(mix(colors.calyxA, colors.calyxB, r * 0.7), [10, 14, 8], 0.62);
    ctx.fillStyle = rgba(dark, 1);
    ctx.beginPath();
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const tt = i / steps;
      ctx.lineTo(rad(tt) * 0.85 * U, -tt * U);
    }
    for (let i = steps; i >= 0; i--) {
      const tt = i / steps;
      ctx.lineTo(-rad(tt) * 0.85 * U, -tt * U);
    }
    ctx.closePath();
    ctx.fill();
  }

  type Item =
    | { z: number; k: 'c'; x: number; y: number; z3: number; sz: number; lean: number; rr: number; t: number }
    | { z: number; k: 'p'; x: number; y: number; ang: number; len: number }
    | { z: number; k: 'l'; x: number; y: number; ang: number; sz: number };
  const items: Item[] = [];

  for (let i = 0; i < cfg.n; i++) {
    const t = Math.pow(rnd(), 0.85) * 0.97 + 0.02;
    const phi = rnd() * Math.PI * 2;
    const rt = rad(t);
    const rr = rt * (0.45 + 0.55 * Math.sqrt(rnd()));
    const x = rr * Math.sin(phi);
    const z3 = rr * Math.cos(phi);
    const y = -t + (rnd() - 0.5) * 0.02;
    const sz = cfg.calyx * (0.75 + 0.55 * rnd()) * (0.8 + 0.25 * (rt / cfg.maxR)) * (0.9 + 0.25 * r);
    const lean = (x / Math.max(rt, 0.03)) * 0.75 + (rnd() - 0.5) * 0.5;
    items.push({ z: z3, k: 'c', x, y, z3, sz, lean, rr: rt, t });
  }
  const np = Math.round(cfg.pist * (1 - 0.18 * r));
  for (let i = 0; i < np; i++) {
    const t = Math.pow(rnd(), 0.9) * 0.97 + 0.02;
    const phi = rnd() * Math.PI * 2;
    const rt = rad(t) * (0.75 + 0.25 * rnd());
    const x = rt * Math.sin(phi);
    const zz = rt * Math.cos(phi);
    const lean = (x / Math.max(rad(t), 0.03)) * 0.9 + (rnd() - 0.5) * 0.9;
    items.push({
      z: zz + 0.012,
      k: 'p',
      x,
      y: -t,
      ang: lean,
      len: (0.04 + 0.08 * rnd()) * (shape === 'pop' ? 0.85 : 1),
    });
  }
  for (let i = 0; i < cfg.leaves; i++) {
    const t = 0.03 + 0.72 * (i / cfg.leaves) + rnd() * 0.05;
    const sg = i % 2 === 0 ? -1 : 1;
    const rt = rad(t);
    items.push({
      z: (rnd() - 0.5) * cfg.maxR * 1.6,
      k: 'l',
      x: sg * rt * 0.75,
      y: -t,
      ang: sg * (0.3 + 0.75 * rnd()),
      sz: (0.2 + 0.2 * (1 - t) + 0.06 * rnd()) * (shape === 'pop' ? 0.8 : 1),
    });
  }
  items.sort((a, b) => a.z - b.z);

  const glints: Glint[] = [];
  const leafT = clamp(0.15 + r * 0.7 * s.fadeMax * 0.7, 0, 1);
  const leafPaint = makePaint(s, leafT, 0.95);
  const trichDen = 0.35 + 0.65 * r;

  const trichome = (cx: number, cy: number, ang: number, scale: number) => {
    const L = U * (0.008 + 0.009 * rnd()) * scale;
    const hr = U * (0.0017 + 0.0015 * rnd()) * scale;
    const ex = cx + Math.cos(ang) * L;
    const ey = cy + Math.sin(ang) * L;
    ctx.strokeStyle = 'rgba(235,248,232,0.5)';
    ctx.lineWidth = Math.max(0.7, U * 0.0011);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const v = r * 0.95 + (rnd() - 0.5) * 0.5;
    let fill: string;
    if (v < 0.32) fill = 'rgba(214,240,250,0.62)';
    else if (v < 1.05) fill = 'rgba(255,255,255,0.88)';
    else fill = 'rgba(232,160,64,0.96)';
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(ex, ey, hr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(ex - hr * 0.3, ey - hr * 0.3, hr * 0.38, 0, Math.PI * 2);
    ctx.fill();
  };

  for (const it of items) {
    if (it.k === 'c') {
      const m = clamp(0.03 + r * 0.9);
      const pick = rnd() < m;
      const base = pick
        ? mix(colors.calyxA, colors.calyxB, 0.8 + 0.2 * rnd())
        : mix(colors.calyxA, colors.calyxB, 0.18 * rnd() * m);
      const lz = it.rr > 0 ? clamp(it.z3 / (it.rr + 0.001), -1, 1) : 0;
      const kz = (0.6 + 0.4 * (lz + 1) * 0.5) * (0.9 + 0.2 * it.t) * (0.92 + 0.16 * rnd());
      const light = mix(base, colors.calyxLight, 0.08 + 0.18 * (lz + 1) * 0.5);
      const sz = it.sz * U;
      ctx.save();
      ctx.translate(it.x * U, it.y * U);
      ctx.rotate(it.lean);
      const g = ctx.createRadialGradient(-sz * 0.25, -sz * 0.35, sz * 0.05, 0, 0, sz * 1.3);
      g.addColorStop(0, rgba(light, 1, kz * 1.05));
      g.addColorStop(0.5, rgba(base, 1, kz));
      g.addColorStop(1, rgba(base, 1, kz * 0.5));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -sz * 1.45);
      ctx.bezierCurveTo(sz * 0.95, -sz * 0.5, sz * 1.0, sz * 0.75, 0, sz * 1.0);
      ctx.bezierCurveTo(-sz * 1.0, sz * 0.75, -sz * 0.95, -sz * 0.5, 0, -sz * 1.45);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = Math.max(0.7, U * 0.0018);
      ctx.stroke();
      // Trichome
      const nt = Math.round((1 + (3 + 5 * rnd()) * trichDen) * cfg.trich);
      for (let j = 0; j < nt; j++) {
        const a = rnd() * Math.PI * 2;
        const rd = Math.sqrt(rnd()) * 0.92;
        const px = Math.cos(a) * sz * 0.85 * rd;
        const py = Math.sin(a) * sz * 1.1 * rd - sz * 0.2;
        const dirA = Math.atan2(py, px) + (rnd() - 0.5) * 0.9 - (rnd() > 0.5 ? 0.4 : 0);
        trichome(px, py, dirA, 1);
        if (glints.length < 40 && rnd() < 0.03 * (0.3 + r) && lz > -0.2) {
          const wx = it.x * U + (px * Math.cos(it.lean) - py * Math.sin(it.lean));
          const wy = it.y * U + (px * Math.sin(it.lean) + py * Math.cos(it.lean));
          glints.push({ x: wx / U, y: wy / U, ph: rnd() * 10, sz: 0.6 + rnd() * 0.8 });
        }
      }
      ctx.restore();
    } else if (it.k === 'p') {
      const m2 = clamp(r * 1.25 + (rnd() - 0.5) * 0.45 - 0.12);
      const col = mix(colors.pistilA, colors.pistilB, m2);
      const l = it.len * U;
      const dx = Math.sin(it.ang);
      const dy = -Math.cos(it.ang);
      const px = -dy;
      const py = dx;
      const sx = it.x * U;
      const sy = it.y * U;
      const o = () => (rnd() - 0.5) * l;
      ctx.strokeStyle = rgba(col, 0.95, 0.9 + 0.2 * rnd());
      ctx.lineWidth = Math.max(1, U * 0.0038 * (0.8 + 0.5 * rnd()));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(
        sx + dx * l * 0.35 + px * o() * 0.7,
        sy + dy * l * 0.35 + py * o() * 0.7,
        sx + dx * l * 0.7 + px * o() * 0.9,
        sy + dy * l * 0.7 + py * o() * 0.9,
        sx + dx * l + px * o() * 0.5,
        sy + dy * l + py * o() * 0.5,
      );
      ctx.stroke();
    } else {
      const S = it.sz * U;
      ctx.save();
      ctx.translate(it.x * U, it.y * U);
      ctx.rotate(it.ang);
      drawLeafAssembly(ctx, 'sugar', 3, s.leafWidth * 0.85, leafPaint, S, 5 + (it.sz * 100) | 0);
      // Harzfrost auf Zuckerblatt
      const nf = Math.round(24 * trichDen + 6);
      for (let j = 0; j < nf; j++) {
        const yy = -S * (0.12 + 0.82 * rnd());
        const xx = (rnd() - 0.5) * S * 0.38 * (1 - Math.abs(yy / S) * 0.5);
        trichome(xx, yy, rnd() * Math.PI * 2, 0.8);
      }
      ctx.restore();
    }
  }

  // Harzfrost-Schimmer
  const nfr = Math.round(26 + 40 * r);
  for (let i = 0; i < nfr; i++) {
    const t = 0.05 + rnd() * 0.9;
    const x = (rnd() * 2 - 1) * rad(t) * 0.9;
    const rr = U * (0.03 + 0.03 * rnd());
    const g = ctx.createRadialGradient(x * U, -t * U, 0, x * U, -t * U, rr);
    g.addColorStop(0, `rgba(255,255,255,${0.1 + 0.08 * r})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x * U - rr, -t * U - rr, rr * 2, rr * 2);
  }

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
