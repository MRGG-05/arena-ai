import { Cam } from './cam';
import { clamp, lerp, makeCanvas, rng, smooth } from './util';
import type { Strain } from './strains';
import { budKey, buildBud, BUD_LEVELS, getGlintSprite, getSprite } from './sprites';

export const POT = {
  bottom: 2.4,
  top: 26,
  rim: 3.2,
  rTop: 14.5,
  rBot: 10.6,
  rRim: 15.6,
  soilY: 23.2,
  saucerR: 14.4,
  saucerBot: 11.8,
};

/* ------------------------------ Texturen ------------------------------ */
interface Textures {
  soil: HTMLCanvasElement;
  clay: HTMLCanvasElement;
  wood: HTMLCanvasElement;
  rootSoil: HTMLCanvasElement;
}
let tex: Textures | null = null;

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rnd: () => number, n = 6) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
    const rr = r * (0.6 + 0.6 * rnd());
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.85;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function makeSoil(w: number, h: number, seed: number, wet = true): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const rnd = rng(seed);
  ctx.fillStyle = '#2a1a0f';
  ctx.fillRect(0, 0, w, h);
  const pal = ['#3b2616', '#1d110a', '#4a3220', '#55391f', '#2f1e12', '#442c19', '#201409'];
  const area = (w * h) / (1024 * 512);
  // Körnung
  for (let i = 0; i < 16000 * area; i++) {
    ctx.fillStyle = pal[(rnd() * pal.length) | 0];
    ctx.globalAlpha = 0.35 + rnd() * 0.5;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Kokos-/Torffasern
  ctx.lineCap = 'round';
  for (let i = 0; i < 2600 * area; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const l = 5 + rnd() * 16;
    const a = rnd() * Math.PI * 2;
    ctx.strokeStyle = rnd() > 0.5 ? 'rgba(104,74,44,0.7)' : 'rgba(64,42,24,0.8)';
    ctx.lineWidth = 0.8 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rnd() * 4, y + Math.sin(a) * l * 0.5 + rnd() * 4, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // Rindenstücke
  for (let i = 0; i < 70 * area; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 6 + rnd() * 12;
    polygon(ctx, x, y, r, rnd, 6);
    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, '#7a5330');
    g.addColorStop(1, '#3a2412');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,4,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Perlit
  for (let i = 0; i < 420 * area; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 1.8 + rnd() * 4.2;
    polygon(ctx, x, y, r, rnd, 5);
    const v = 215 + rnd() * 40;
    ctx.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 14) | 0})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,70,60,0.5)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lichter
  for (let i = 0; i < 4200 * area; i++) {
    ctx.fillStyle = `rgba(150,110,70,${0.15 + rnd() * 0.35})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.3, 1.3);
  }
  // Feuchte Flecken
  if (wet) {
    for (let i = 0; i < 18; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 40 + rnd() * 110;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(10,5,2,0.4)');
      g.addColorStop(1, 'rgba(10,5,2,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  return c;
}

function makeClay(): HTMLCanvasElement {
  const w = 1024;
  const h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const rnd = rng(99);
  ctx.fillStyle = '#efd2bc';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26000; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.55 ? `rgba(120,60,36,${0.08 + rnd() * 0.22})` : `rgba(255,236,220,${0.1 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // Drehrillen
  for (let y = 0; y < h; y += 6 + rnd() * 10) {
    ctx.fillStyle = `rgba(110,50,30,${0.05 + rnd() * 0.07})`;
    ctx.fillRect(0, y, w, 1 + rnd() * 1.5);
    ctx.fillStyle = `rgba(255,235,215,${0.05 + rnd() * 0.06})`;
    ctx.fillRect(0, y + 2, w, 1);
  }
  // Wolken
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 60 + rnd() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() > 0.5 ? 'rgba(130,60,35,0.14)' : 'rgba(255,240,225,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

function makeWood(): HTMLCanvasElement {
  const w = 2048;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const rnd = rng(5);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a2616');
  g.addColorStop(1, '#58391f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * h) / planks;
    const ph = h / planks;
    ctx.fillStyle = `rgba(${(rnd() * 40) | 0},${(rnd() * 20) | 0},0,${0.1 + rnd() * 0.15})`;
    ctx.fillRect(0, y0, w, ph);
    for (let i = 0; i < 90; i++) {
      const y = y0 + rnd() * ph;
      ctx.strokeStyle = rnd() > 0.5 ? `rgba(20,10,4,${0.1 + rnd() * 0.25})` : `rgba(160,110,70,${0.05 + rnd() * 0.1})`;
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      const ph1 = rnd() * 6;
      for (let x = 0; x <= w; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.004 + ph1) * (1 + rnd() * 2));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, y0, w, 2);
    ctx.fillStyle = 'rgba(255,220,180,0.08)';
    ctx.fillRect(0, y0 + 2, w, 1.5);
  }
  return c;
}

function getTex(): Textures {
  if (!tex) {
    tex = {
      soil: makeSoil(1024, 512, 3),
      clay: makeClay(),
      wood: makeWood(),
      rootSoil: makeSoil(512, 512, 8, false),
    };
  }
  return tex;
}

/* ------------------------------ Hintergrund ------------------------------ */
let bg: { key: string; c: HTMLCanvasElement } | null = null;

function getBg(W: number, H: number) {
  const key = `${W}x${H}`;
  if (bg && bg.key === key) return bg.c;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#071012');
  g.addColorStop(0.55, '#10201f');
  g.addColorStop(1, '#1b2e2b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = rng(42);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = H * (0.05 + rnd() * 0.18);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    gg.addColorStop(0, rnd() > 0.5 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.05)');
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Lichtkegel
  const lg = ctx.createRadialGradient(W / 2, -H * 0.1, 0, W / 2, -H * 0.1, H * 1.15);
  lg.addColorStop(0, 'rgba(255,246,222,0.42)');
  lg.addColorStop(0.35, 'rgba(255,240,210,0.14)');
  lg.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  bg = { key, c };
  return c;
}

export function drawBackground(ctx: CanvasRenderingContext2D, cam: Cam) {
  const { W, H } = cam;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(getBg(W, H), 0, 0);
  // Tisch
  const far = cam.project(0, 0, -95)[1];
  if (far < H) {
    const y0 = Math.max(0, far);
    const t = getTex();
    ctx.drawImage(t.wood, 0, y0, W, H - y0);
    const sg = ctx.createLinearGradient(0, y0, 0, H);
    sg.addColorStop(0, 'rgba(0,0,0,0.55)');
    sg.addColorStop(0.35, 'rgba(0,0,0,0.05)');
    sg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, y0, W, H - y0);
    // Lichtfleck auf dem Tisch
    const c0 = cam.project(0, 0, 0);
    ctx.save();
    ctx.translate(c0[0], c0[1]);
    ctx.scale(1, 0.32);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, cam.s * 70);
    rg.addColorStop(0, 'rgba(255,230,190,0.22)');
    rg.addColorStop(1, 'rgba(255,230,190,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(-cam.s * 70, -cam.s * 70, cam.s * 140, cam.s * 140);
    ctx.restore();
    // Kante
    if (far > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, far - 2, W, 4);
      ctx.fillStyle = 'rgba(255,225,180,0.16)';
      ctx.fillRect(0, far + 2, W, 2);
    }
  }
}

/* ------------------------------ Topf ------------------------------ */
interface E {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

function ell(cam: Cam, y: number, R: number): E {
  const p = cam.project(0, y, 0);
  return { x: p[0], y: p[1], rx: R * cam.s, ry: R * cam.s * cam.sinT };
}

function bodyPath(ctx: CanvasRenderingContext2D, top: E, bot: E) {
  ctx.beginPath();
  ctx.moveTo(top.x - top.rx, top.y);
  ctx.lineTo(bot.x - bot.rx, bot.y);
  ctx.ellipse(bot.x, bot.y, bot.rx, bot.ry, 0, Math.PI, 0, true);
  ctx.lineTo(top.x + top.rx, top.y);
  ctx.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI, false);
  ctx.closePath();
}

function cylGrad(ctx: CanvasRenderingContext2D, x: number, r: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

const CLAY_STOPS: [number, string][] = [
  [0, '#6a2b17'],
  [0.12, '#97431f'],
  [0.34, '#d97b4a'],
  [0.46, '#e38c5c'],
  [0.7, '#b04f2a'],
  [0.9, '#7b341b'],
  [1, '#4d1e10'],
];

export function drawPot(ctx: CanvasRenderingContext2D, cam: Cam, day: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const t = getTex();
  const s = cam.s;

  // Kontaktschatten
  const c0 = ell(cam, 0, 1);
  ctx.save();
  ctx.translate(c0.x, c0.y);
  ctx.scale(1, cam.sinT * 1.15);
  const sh = ctx.createRadialGradient(0, 0, s * 8, 0, 0, s * 27);
  sh.addColorStop(0, 'rgba(0,0,0,0.7)');
  sh.addColorStop(0.55, 'rgba(0,0,0,0.38)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-s * 27, -s * 27, s * 54, s * 54);
  ctx.restore();

  // Untersetzer
  {
    const top = ell(cam, POT.bottom, POT.saucerR);
    const bot = ell(cam, 0, POT.saucerBot);
    bodyPath(ctx, top, bot);
    ctx.fillStyle = cylGrad(ctx, top.x, top.rx, CLAY_STOPS);
    ctx.fill();
    ctx.save();
    bodyPath(ctx, top, bot);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(t.clay, top.x - top.rx, top.y - top.ry, top.rx * 2, bot.y - top.y + bot.ry * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const dg = ctx.createLinearGradient(0, top.y, 0, bot.y + bot.ry);
    dg.addColorStop(0, 'rgba(0,0,0,0.35)');
    dg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = dg;
    ctx.fillRect(top.x - top.rx, top.y, top.rx * 2, bot.y - top.y + bot.ry * 2);
    ctx.restore();
    // Obere Fläche des Untersetzers
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, top.rx, top.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7d3a20';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,160,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(top.x, top.y, top.rx * 0.88, top.ry * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5a2a16';
    ctx.fill();
  }

  // Topfkörper
  const bTop = ell(cam, POT.top - POT.rim, POT.rTop);
  const bBot = ell(cam, POT.bottom, POT.rBot);
  bodyPath(ctx, bTop, bBot);
  ctx.fillStyle = cylGrad(ctx, bTop.x, bTop.rx, CLAY_STOPS);
  ctx.fill();
  ctx.save();
  bodyPath(ctx, bTop, bBot);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.85;
  ctx.drawImage(t.clay, bTop.x - bTop.rx, bTop.y - bTop.ry, bTop.rx * 2, bBot.y - bTop.y + bBot.ry * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  // Kalk-/Mineralablagerungen
  const rr = rng(21);
  for (let i = 0; i < 26; i++) {
    const u = (rr() * 2 - 1) * 0.92;
    const f0 = rr() * 0.15;
    const f1 = f0 + 0.15 + rr() * 0.6;
    const Rt = (f: number) => lerp(POT.rTop, POT.rBot, f);
    const yTop = bTop.y + (bBot.y - bTop.y) * f0;
    const yBot = bTop.y + (bBot.y - bTop.y) * f1;
    const gx = ctx.createLinearGradient(0, yTop, 0, yBot);
    gx.addColorStop(0, `rgba(235,225,205,${0.06 + rr() * 0.1})`);
    gx.addColorStop(1, 'rgba(235,225,205,0)');
    ctx.strokeStyle = gx;
    ctx.lineWidth = Math.max(1, s * (0.2 + rr() * 0.6));
    ctx.beginPath();
    ctx.moveTo(bTop.x + u * Rt(f0) * s, yTop);
    ctx.lineTo(bTop.x + u * Rt(f1) * s, yBot);
    ctx.stroke();
  }
  // Vertikaler Schattenverlauf
  const vg = ctx.createLinearGradient(0, bTop.y, 0, bBot.y + bBot.ry);
  vg.addColorStop(0, 'rgba(0,0,0,0.28)');
  vg.addColorStop(0.18, 'rgba(0,0,0,0)');
  vg.addColorStop(0.8, 'rgba(0,0,0,0.05)');
  vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(bTop.x - bTop.rx, bTop.y, bTop.rx * 2, bBot.y - bTop.y + bBot.ry * 2);
  // Glanzstreifen
  const hg = ctx.createLinearGradient(bTop.x - bTop.rx, 0, bTop.x + bTop.rx, 0);
  hg.addColorStop(0.26, 'rgba(255,230,200,0)');
  hg.addColorStop(0.36, 'rgba(255,235,210,0.1)');
  hg.addColorStop(0.43, 'rgba(255,235,210,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(bTop.x - bTop.rx, bTop.y, bTop.rx * 2, bBot.y - bTop.y + bBot.ry * 2);
  ctx.restore();

  // Rand (Wulst)
  const rTopE = ell(cam, POT.top, POT.rRim);
  const rBotE = ell(cam, POT.top - POT.rim, POT.rRim - 0.55);
  // Schatten unter dem Rand
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(rBotE.x, rBotE.y, rBotE.rx, rBotE.ry, 0, 0, Math.PI, false);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(2, s * 0.5);
  ctx.stroke();
  ctx.restore();
  bodyPath(ctx, rTopE, rBotE);
  ctx.fillStyle = cylGrad(ctx, rTopE.x, rTopE.rx, [
    [0, '#7a3119'],
    [0.14, '#a64c25'],
    [0.36, '#e8956a'],
    [0.5, '#e99a6c'],
    [0.72, '#bb5a30'],
    [0.92, '#86391d'],
    [1, '#582414'],
  ]);
  ctx.fill();
  ctx.save();
  bodyPath(ctx, rTopE, rBotE);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(t.clay, rTopE.x - rTopE.rx, rTopE.y - rTopE.ry, rTopE.rx * 2, rBotE.y - rTopE.y + rBotE.ry * 2);
  ctx.restore();
  ctx.save();
  bodyPath(ctx, rTopE, rBotE);
  ctx.strokeStyle = 'rgba(40,12,4,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.stroke();
  ctx.restore();

  // Rand-Oberseite
  const inner = ell(cam, POT.top, POT.rRim - 2.1);
  ctx.beginPath();
  ctx.ellipse(rTopE.x, rTopE.y, rTopE.rx, rTopE.ry, 0, 0, Math.PI * 2);
  ctx.ellipse(inner.x, inner.y, inner.rx, inner.ry, 0, 0, Math.PI * 2, true);
  const rg = ctx.createLinearGradient(0, rTopE.y - rTopE.ry, 0, rTopE.y + rTopE.ry);
  rg.addColorStop(0, '#9a4a28');
  rg.addColorStop(0.5, '#d98055');
  rg.addColorStop(1, '#eea272');
  ctx.fillStyle = rg;
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,215,180,0.4)';
  ctx.lineWidth = Math.max(1, s * 0.1);
  ctx.beginPath();
  ctx.ellipse(rTopE.x, rTopE.y, rTopE.rx, rTopE.ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  // Innenwand + Erde
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(inner.x, inner.y, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const iw = ctx.createLinearGradient(0, inner.y - inner.ry, 0, inner.y + inner.ry);
  iw.addColorStop(0, '#2a110a');
  iw.addColorStop(1, '#5b2a17');
  ctx.fillStyle = iw;
  ctx.fillRect(inner.x - inner.rx, inner.y - inner.ry, inner.rx * 2, inner.ry * 2);
  const soil = ell(cam, POT.soilY, POT.rRim - 2.2);
  ctx.drawImage(t.soil, soil.x - soil.rx, soil.y - soil.ry, soil.rx * 2, soil.ry * 2);
  // Schatten zum Rand hin
  ctx.save();
  ctx.translate(soil.x, soil.y);
  ctx.scale(1, cam.sinT);
  const eg = ctx.createRadialGradient(0, 0, soil.rx * 0.55, 0, 0, soil.rx * 1.02);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = eg;
  ctx.fillRect(-soil.rx, -soil.rx, soil.rx * 2, soil.rx * 2);
  // Glanz (feuchte Erde)
  const wg = ctx.createRadialGradient(-soil.rx * 0.2, -soil.rx * 0.25, 0, -soil.rx * 0.2, -soil.rx * 0.25, soil.rx * 0.7);
  wg.addColorStop(0, 'rgba(255,230,200,0.08)');
  wg.addColorStop(1, 'rgba(255,230,200,0)');
  ctx.fillStyle = wg;
  ctx.fillRect(-soil.rx, -soil.rx, soil.rx * 2, soil.rx * 2);
  ctx.restore();

  // Mulde / Erdhügel an der Pflanzstelle
  const sp = cam.project(0, POT.soilY, 0);
  if (day < 4.6) {
    // Pflanzloch
    const open = 1 - smooth((day - 2.6) / 1.8);
    ctx.save();
    ctx.translate(sp[0], sp[1]);
    ctx.scale(1, cam.sinT);
    const hr = s * 1.3;
    const hg2 = ctx.createRadialGradient(0, 0, 0, 0, 0, hr);
    hg2.addColorStop(0, `rgba(18,9,4,${0.85 * open})`);
    hg2.addColorStop(0.6, `rgba(30,16,8,${0.5 * open})`);
    hg2.addColorStop(1, 'rgba(30,16,8,0)');
    ctx.fillStyle = hg2;
    ctx.fillRect(-hr, -hr, hr * 2, hr * 2);
    ctx.restore();
    if (day < 3) {
      drawSeed(ctx, sp[0], sp[1] - s * 0.1, s * 0.5, -0.3, day > 2.2 ? (day - 2.2) / 0.8 : 0, 1 - smooth((day - 2.4) / 0.6));
    }
  }
  ctx.restore();
}

export function drawSeed(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ang: number, crack = 0, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  const rx = size;
  const ry = size * 0.72;
  const g = ctx.createRadialGradient(-rx * 0.3, -ry * 0.4, rx * 0.1, 0, 0, rx * 1.2);
  g.addColorStop(0, '#b08a58');
  g.addColorStop(0.55, '#7b5a34');
  g.addColorStop(1, '#3a2615');
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(30,18,8,0.55)';
  ctx.lineWidth = Math.max(0.8, size * 0.09);
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-rx, i * ry * 0.3);
    ctx.bezierCurveTo(-rx * 0.4, i * ry * 0.3 - ry * 0.35, rx * 0.3, i * ry * 0.3 + ry * 0.3, rx, i * ry * 0.3 + (i % 2 ? 1 : -1) * ry * 0.2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,10,4,0.7)';
  ctx.lineWidth = Math.max(0.8, size * 0.06);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Naht
  ctx.strokeStyle = 'rgba(210,180,130,0.55)';
  ctx.beginPath();
  ctx.moveTo(-rx * 0.8, -ry * 0.2);
  ctx.quadraticCurveTo(0, ry * 0.2 - ry * 0.7, rx * 0.8, -ry * 0.2);
  ctx.stroke();
  if (crack > 0) {
    ctx.fillStyle = '#f4ecd2';
    ctx.beginPath();
    ctx.ellipse(rx * 0.95, 0, size * 0.18 * crack + 0.5, size * 0.1 * crack + 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------ Wurzeln ------------------------------ */
interface Root {
  pts: number[];
  d0: number;
  w: number;
}

const STEP = 0.45;
const MAX_X = 12.4;
const MAX_Y = 20.2;

function growRoot(out: Root[], rnd: () => number, x: number, y: number, ang: number, len: number, d0: number, w: number, depth: number) {
  const n = Math.max(2, Math.floor(len / STEP));
  const pts = [x, y];
  let cx = x;
  let cy = y;
  let a = ang;
  const spawn: [number, number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    a += (rnd() - 0.5) * 0.4;
    a += (Math.PI / 2 - a) * (depth === 0 ? 0.06 : 0.035);
    cx += Math.cos(a) * STEP;
    cy += Math.sin(a) * STEP;
    if (cx > MAX_X) {
      cx = MAX_X;
      a = Math.PI / 2 + 0.2;
    }
    if (cx < -MAX_X) {
      cx = -MAX_X;
      a = Math.PI / 2 - 0.2;
    }
    if (cy > MAX_Y) {
      cy = MAX_Y;
      a = Math.cos(a) >= 0 ? 0.15 : Math.PI - 0.15;
    }
    pts.push(cx, cy);
    if (depth < 2 && i > 2 && rnd() < (depth === 0 ? 0.3 : 0.13)) {
      const sg = rnd() < 0.5 ? -1 : 1;
      spawn.push([cx, cy, Math.PI / 2 + sg * (0.8 + rnd() * 0.7), depth === 0 ? 2.5 + rnd() * 8 : 1.5 + rnd() * 3.5, d0 + (i + 1) * STEP]);
    }
  }
  out.push({ pts, d0, w });
  for (const sp of spawn) growRoot(out, rnd, sp[0], sp[1], sp[2], sp[3], sp[4], w * 0.55, depth + 1);
}

export function buildRoots(seed: number): Root[] {
  const rnd = rng(seed * 31 + 7);
  const out: Root[] = [];
  growRoot(out, rnd, 0, 1.3, Math.PI / 2, 19, 0, 0.36, 0);
  for (let i = 0; i < 4; i++) {
    const sg = i % 2 ? 1 : -1;
    growRoot(out, rnd, sg * 0.3, 0.2, Math.PI / 2 + sg * (0.9 + rnd() * 0.5), 10 + rnd() * 6, 12 + i * 2, 0.26, 0);
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rootGrowth(day: number, strain: Strain) {
  return 52 * Math.pow(clamp((day - 1.6) / (strain.flowerStart + 12)), 0.82);
}

export function drawRootPanel(ctx: CanvasRenderingContext2D, box: Box, day: number, strain: Strain, roots: Root[], height: number, alpha: number) {
  if (alpha <= 0.01) return;
  const t = getTex();
  const G = rootGrowth(day, strain);
  const zoom = lerp(3.4, 1, smooth((day - 5) / 24));
  const k = (box.w / 30) * zoom;
  const cx = box.x + box.w / 2;
  const topY = box.y + box.h * 0.13;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  const rad = box.w * 0.045;
  // Rahmen / Hintergrund
  ctx.beginPath();
  ctx.moveTo(box.x + rad, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, rad);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, rad);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y, rad);
  ctx.arcTo(box.x, box.y, box.x + box.w, box.y, rad);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,14,14,0.78)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Luft
  const ag = ctx.createLinearGradient(0, box.y, 0, topY);
  ag.addColorStop(0, '#16302f');
  ag.addColorStop(1, '#244544');
  ctx.fillStyle = ag;
  ctx.fillRect(box.x, box.y, box.w, topY - box.y);
  // Erde (Schnitt)
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, topY, box.w, box.y + box.h - topY);
  ctx.clip();
  ctx.translate(cx, topY);
  const sc = k / 40;
  ctx.scale(sc, sc);
  const pat = ctx.createPattern(t.rootSoil, 'repeat');
  if (pat) {
    ctx.fillStyle = pat;
    ctx.fillRect(-box.w / sc, 0, (box.w * 2) / sc, (box.h * 1.5) / sc);
  }
  ctx.restore();
  // Tiefenschatten
  const dg = ctx.createLinearGradient(0, topY, 0, box.y + box.h);
  dg.addColorStop(0, 'rgba(0,0,0,0)');
  dg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = dg;
  ctx.fillRect(box.x, topY, box.w, box.y + box.h - topY);
  // Topfwände
  const wallW = 1.5 * k;
  for (const sg of [-1, 1]) {
    const wx = cx + sg * (POT.rTop - 0.4) * k - (sg > 0 ? 0 : wallW);
    const g = ctx.createLinearGradient(wx, 0, wx + wallW, 0);
    g.addColorStop(0, sg > 0 ? '#c0623a' : '#7a3319');
    g.addColorStop(1, sg > 0 ? '#7a3319' : '#c0623a');
    ctx.fillStyle = g;
    ctx.fillRect(wx, topY - 2 * k, wallW, box.y + box.h);
  }
  const bottomY = topY + (MAX_Y + 1.4) * k;
  ctx.fillStyle = '#8a3b1d';
  ctx.fillRect(box.x, bottomY, box.w, box.h);

  // Wurzeln
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const mp = (x: number, y: number): [number, number] => [cx + x * k, topY + y * k];
  for (const r of roots) {
    const L = G - r.d0;
    if (L <= 0) continue;
    const total = r.pts.length / 2;
    const n = Math.min(total, Math.floor(L / STEP) + 1);
    if (n < 2) continue;
    const wid = r.w * k * (0.55 + 0.45 * smooth(L / 5));
    const path = () => {
      ctx.beginPath();
      const p0 = mp(r.pts[0], r.pts[1]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < n; i++) {
        const p = mp(r.pts[i * 2], r.pts[i * 2 + 1]);
        ctx.lineTo(p[0], p[1]);
      }
      // wachsende Spitze (Teilsegment)
      if (n < total) {
        const frac = (L / STEP) % 1;
        const a = mp(r.pts[(n - 1) * 2], r.pts[(n - 1) * 2 + 1]);
        const b = mp(r.pts[n * 2], r.pts[n * 2 + 1]);
        ctx.lineTo(a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac);
      }
    };
    path();
    ctx.strokeStyle = 'rgba(255,248,230,0.1)';
    ctx.lineWidth = wid * 3;
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(70,50,28,0.7)';
    ctx.lineWidth = wid + Math.max(1.2, k * 0.06);
    ctx.stroke();
    path();
    ctx.strokeStyle = '#eee3c6';
    ctx.lineWidth = wid;
    ctx.stroke();
    path();
    ctx.strokeStyle = 'rgba(255,255,248,0.65)';
    ctx.lineWidth = Math.max(0.8, wid * 0.32);
    ctx.stroke();
  }

  // Samen & Keimling
  const seedY = 1.4;
  const hyp = smooth((day - 2.6) / 2.4);
  if (day < 4.8) {
    const p = mp(0, seedY);
    const sy = p[1] - hyp * seedY * k * 0.98;
    drawSeed(ctx, p[0], sy, 0.46 * k * 1.6, -0.25, day > 2 ? clamp((day - 2) / 0.9) : 0, 1);
    if (day > 2.5) {
      ctx.strokeStyle = '#e9f1c6';
      ctx.lineWidth = Math.max(2, k * 0.2);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0], sy);
      ctx.stroke();
    }
  }
  // Austrieb über der Erde
  if (day >= 4.6) {
    const hh = Math.min(height, 3) * k * 0.8;
    ctx.strokeStyle = '#cfe59a';
    ctx.lineWidth = Math.max(2, k * 0.2);
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx, topY - hh);
    ctx.stroke();
    ctx.fillStyle = '#77b34a';
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + sg * k * 0.9, topY - hh - k * 0.1, k * 0.9, k * 0.35, sg * -0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Boden-Linie der Erde
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(box.x, topY - 1, box.w, 2);
  ctx.restore();

  // Rahmen & Beschriftung
  ctx.strokeStyle = 'rgba(160,255,200,0.28)';
  ctx.lineWidth = Math.max(1.5, box.w * 0.004);
  ctx.beginPath();
  ctx.moveTo(box.x + rad, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + box.h, rad);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x, box.y + box.h, rad);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y, rad);
  ctx.arcTo(box.x, box.y, box.x + box.w, box.y, rad);
  ctx.closePath();
  ctx.stroke();
  const fs = Math.round(box.w * 0.048);
  ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(200,255,225,0.9)';
  ctx.textBaseline = 'top';
  ctx.fillText('WURZELZONE', box.x + box.w * 0.06, box.y + box.h * 0.035);
  const depthCm = Math.min(G, MAX_Y + 1);
  ctx.font = `500 ${Math.round(fs * 0.85)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'right';
  ctx.fillText(`Tiefe ${depthCm.toFixed(depthCm < 10 ? 1 : 0)} cm`, box.x + box.w * 0.94, box.y + box.h * 0.04);
  ctx.textAlign = 'left';
  ctx.restore();
}

/* ------------------------------ Ernte-Szene ------------------------------ */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fresh = true) {
  if (fresh) ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBudAt(
  ctx: CanvasRenderingContext2D,
  strain: Strain,
  shape: 'cola' | 'side' | 'pop',
  variant: number,
  level: number,
  x: number,
  y: number,
  height: number,
  ang: number,
  time: number,
  glints = true,
) {
  const tier = height > 560 ? 1024 : height > 260 ? 640 : 320;
  const sp = getSprite(budKey(strain, shape, variant, tier, level), () => buildBud(strain, shape, variant, tier, level));
  const k = height / sp.unit;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(k, k);
  ctx.drawImage(sp.canvas, -sp.ox, -sp.oy);
  ctx.restore();
  if (glints && sp.glints) {
    const gs = getGlintSprite();
    const base = ctx.globalAlpha;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    for (let i = 0; i < sp.glints.length; i++) {
      const g = sp.glints[i];
      const a = Math.pow(Math.max(0, Math.sin(time * (1.1 + (i % 5) * 0.23) + g.ph)), 8);
      if (a < 0.05) continue;
      const gx = g.x * height;
      const gy = g.y * height;
      const px = x + gx * ca - gy * sa;
      const py = y + gx * sa + gy * ca;
      const r = Math.max(5, height * 0.035) * g.sz;
      ctx.globalAlpha = a * base;
      ctx.drawImage(gs, px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = base;
  }
}

let jarLayout: { key: string; items: { shape: 'side' | 'pop'; v: number; x: number; y: number; a: number; s: number }[] } | null = null;

export function drawHarvestScene(ctx: CanvasRenderingContext2D, cam: Cam, strain: Strain, ripeness: number, time: number, alpha: number, amount: number) {
  if (alpha <= 0.01) return;
  const { W, H } = cam;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const level = Math.round(clamp(ripeness) * (BUD_LEVELS - 1));
  ctx.globalAlpha = alpha;
  const tableY = cam.project(0, 0, 0)[1];

  // Glas-Dose
  const jw = H * 0.4;
  const jx = W * 0.3 - jw / 2;
  const jb = H * 0.9;
  const jt = jb - H * 0.56;
  const neckW = jw * 0.8;
  const glassPath = () => {
    rr(ctx, jx, jt + H * 0.075, jw, jb - jt - H * 0.075, H * 0.055);
    rr(ctx, jx + (jw - neckW) / 2, jt, neckW, H * 0.1, H * 0.012, false);
  };
  // Schatten
  ctx.save();
  ctx.translate(jx + jw / 2, jb);
  ctx.scale(1, 0.18);
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, jw * 0.85);
  sh.addColorStop(0, 'rgba(0,0,0,0.75)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-jw, -jw, jw * 2, jw * 2);
  ctx.restore();

  // Inhalt
  const key = `${strain.id}|${W}|${H}`;
  if (!jarLayout || jarLayout.key !== key) {
    const r = rng(strain.seed + 5);
    const items: { shape: 'side' | 'pop'; v: number; x: number; y: number; a: number; s: number }[] = [];
    for (let i = 0; i < 46; i++) {
      const row = i / 46;
      items.push({
        shape: r() > 0.55 ? 'side' : 'pop',
        v: (r() * 2) | 0,
        x: (r() * 2 - 1) * 0.42,
        y: 1 - row * 0.9 + (r() - 0.5) * 0.08,
        a: (r() - 0.5) * Math.PI * 2,
        s: 0.75 + r() * 0.5,
      });
    }
    items.sort((a, b) => b.y - a.y);
    jarLayout = { key, items };
  }
  ctx.save();
  glassPath();
  ctx.clip('nonzero');
  ctx.fillStyle = 'rgba(10,20,20,0.35)';
  ctx.fillRect(jx, jt, jw, jb - jt);
  const bodyH = jb - jt - H * 0.075;
  const fillTo = clamp(0.35 + amount * 0.6, 0.3, 1);
  for (const it of amount > 0.01 ? jarLayout.items : []) {
    const yy = jb - H * 0.04 - (1 - it.y) * bodyH * fillTo * 0.96;
    const xx = jx + jw / 2 + it.x * jw;
    const hh = H * (it.shape === 'side' ? 0.17 : 0.12) * it.s;
    drawBudAt(ctx, strain, it.shape, it.v, level, xx, yy + hh * 0.4, hh, it.a, time, false);
  }
  // Schatten innen
  const ig = ctx.createLinearGradient(jx, 0, jx + jw, 0);
  ig.addColorStop(0, 'rgba(0,0,0,0.5)');
  ig.addColorStop(0.2, 'rgba(0,0,0,0)');
  ig.addColorStop(0.8, 'rgba(0,0,0,0)');
  ig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = ig;
  ctx.fillRect(jx, jt, jw, jb - jt);
  ctx.restore();
  // Glas
  ctx.save();
  glassPath();
  const gg = ctx.createLinearGradient(jx, 0, jx + jw, 0);
  gg.addColorStop(0, 'rgba(220,255,250,0.28)');
  gg.addColorStop(0.08, 'rgba(220,255,250,0.05)');
  gg.addColorStop(0.5, 'rgba(220,255,250,0.03)');
  gg.addColorStop(0.92, 'rgba(220,255,250,0.07)');
  gg.addColorStop(1, 'rgba(220,255,250,0.3)');
  ctx.fillStyle = gg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(235,255,250,0.55)';
  ctx.lineWidth = Math.max(2, H * 0.003);
  ctx.stroke();
  // Reflexe
  ctx.clip();
  const hl = ctx.createLinearGradient(jx + jw * 0.1, 0, jx + jw * 0.2, 0);
  hl.addColorStop(0, 'rgba(255,255,255,0)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(jx + jw * 0.1, jt + H * 0.12, jw * 0.1, bodyH * 0.8);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(jx + jw * 0.84, jt + H * 0.14, jw * 0.025, bodyH * 0.75);
  // Boden-Glasdicke
  const bg2 = ctx.createLinearGradient(0, jb - H * 0.03, 0, jb);
  bg2.addColorStop(0, 'rgba(200,240,235,0)');
  bg2.addColorStop(1, 'rgba(200,240,235,0.3)');
  ctx.fillStyle = bg2;
  ctx.fillRect(jx, jb - H * 0.03, jw, H * 0.03);
  ctx.restore();
  // Deckel
  const lidY = jt - H * 0.045;
  const lidW = neckW * 1.1;
  const lidX = jx + jw / 2 - lidW / 2;
  const lg = ctx.createLinearGradient(lidX, 0, lidX + lidW, 0);
  lg.addColorStop(0, '#5b4514');
  lg.addColorStop(0.2, '#d8b552');
  lg.addColorStop(0.4, '#f5df8c');
  lg.addColorStop(0.7, '#b8923a');
  lg.addColorStop(1, '#4e3a10');
  rr(ctx, lidX, lidY, lidW, H * 0.062, H * 0.01);
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(1, H * 0.0015);
  for (let i = 1; i < 26; i++) {
    const x = lidX + (lidW * i) / 26;
    ctx.beginPath();
    ctx.moveTo(x, lidY + H * 0.006);
    ctx.lineTo(x, lidY + H * 0.056);
    ctx.stroke();
  }
  // Etikett
  const lw2 = jw * 0.5;
  const lh = H * 0.1;
  const lx = jx + jw / 2 - lw2 / 2;
  const ly2 = jb - H * 0.2;
  rr(ctx, lx, ly2, lw2, lh, H * 0.006);
  ctx.fillStyle = 'rgba(244,238,222,0.94)';
  ctx.fill();
  ctx.fillStyle = '#23301f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(H * 0.026)}px Inter, system-ui, sans-serif`;
  ctx.fillText(strain.name.toUpperCase(), lx + lw2 / 2, ly2 + lh * 0.36, lw2 * 0.92);
  ctx.font = `500 ${Math.round(H * 0.018)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#4a5b44';
  ctx.fillText(`${strain.type} · THC ${strain.thc}`, lx + lw2 / 2, ly2 + lh * 0.72, lw2 * 0.92);
  ctx.textAlign = 'left';

  // Einzelne große Blüten auf dem Tisch
  const heroes: { shape: 'cola' | 'side' | 'pop'; v: number; x: number; y: number; h: number; a: number }[] = [
    { shape: 'cola', v: 1, x: 0.56, y: 0.83, h: 0.4, a: 1.25 },
    { shape: 'side', v: 0, x: 0.68, y: 0.9, h: 0.24, a: -0.9 },
    { shape: 'pop', v: 1, x: 0.5, y: 0.9, h: 0.17, a: 0.5 },
  ];
  void tableY;
  for (const h of amount > 0.01 ? heroes : []) {
    const x = W * h.x;
    const y = H * h.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.22);
    const hs = ctx.createRadialGradient(0, 0, 0, 0, 0, H * h.h * 0.6);
    hs.addColorStop(0, 'rgba(0,0,0,0.6)');
    hs.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hs;
    ctx.fillRect(-H, -H, H * 2, H * 2);
    ctx.restore();
    drawBudAt(ctx, strain, h.shape, h.v, level, x, y - H * 0.02, H * h.h, h.a, time, true);
  }
  ctx.globalAlpha = 1;
}

