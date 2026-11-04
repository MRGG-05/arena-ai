import { Cam } from './cam';
import { Plant } from './plant';
import { STRAINS, Strain } from './strains';
import { clamp, lerp, smooth } from './util';
import { buildRoots, drawBackground, drawHarvestScene, drawPot, drawRootPanel, POT } from './scene';
import { pumpSprites, resetSpriteQueue } from './sprites';

export interface HarvestResult {
  grams: number;
  ripeness: number;
  clear: number;
  milky: number;
  amber: number;
  quality: string;
  note: string;
  day: number;
}

export interface EngineState {
  day: number;
  mode: 'grow' | 'cut' | 'done';
  playing: boolean;
  speed: number;
  autoRot: boolean;
  macro: boolean;
  fps: number;
  quality: number;
  height: number;
  ripe: number;
  buds: number;
  harvest: HarvestResult | null;
  cutT: number;
  resolution: string;
}

const SOIL = POT.soilY;
const CUT_H = 7;

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cam = new Cam();
  hcam = new Cam();
  strain: Strain = STRAINS[0];
  plant: Plant;
  roots = buildRoots(1);

  day = 1;
  playing = true;
  speed = 2;
  autoRot = true;
  rotBase = 0.55;
  userRot = 0;
  autoPauseUntil = 0;
  macro = false;
  macroT = 0;
  zoomUser = 1;
  mode: 'grow' | 'cut' | 'done' = 'grow';
  cutT = 0;
  harvest: HarvestResult | null = null;
  quality = 2160;
  aspect = 16 / 9;

  time = 0;
  private last = 0;
  private raf = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  fps = 60;
  private lastEmit = 0;
  private camS = 0;
  private camCY = 0;
  private panelAlpha = 1;
  private running = false;
  private dragging = false;
  private lastX = 0;
  onUpdate: (s: EngineState) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
    this.plant = new Plant(this.strain);
    this.setStrain(STRAINS[0].id);
    this.applySize();
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  destroy() {
    this.stop();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
  };
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.userRot += dx * 0.007;
    this.autoPauseUntil = this.time + 2.5;
  };
  private onUp = () => {
    this.dragging = false;
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomUser = clamp(this.zoomUser * Math.exp(-e.deltaY * 0.0012), 0.75, 2.4);
  };

  /* ------------------------------ Steuerung ------------------------------ */
  setStrain(id: string) {
    const s = STRAINS.find((x) => x.id === id) ?? STRAINS[0];
    this.strain = s;
    this.plant = new Plant(s);
    this.roots = buildRoots(s.seed);
    resetSpriteQueue();
    this.restart();
  }

  restart() {
    this.day = 1;
    this.mode = 'grow';
    this.cutT = 0;
    this.harvest = null;
    this.playing = true;
    this.macro = false;
    this.macroT = 0;
    this.camS = 0;
    this.emit(true);
  }

  setDay(d: number) {
    if (this.mode !== 'grow') this.mode = 'grow';
    this.harvest = null;
    this.day = clamp(d, 1, this.strain.harvestDay);
  }

  setPlaying(p: boolean) {
    if (p && this.day >= this.strain.harvestDay) this.day = 1;
    this.playing = p;
  }

  setSpeed(v: number) {
    this.speed = v;
  }

  setQuality(h: number) {
    this.quality = h;
    this.applySize();
  }

  setAutoRot(v: boolean) {
    this.autoRot = v;
  }

  setMacro(v: boolean) {
    this.macro = v;
  }

  doHarvest() {
    if (this.mode !== 'grow') return;
    const s = this.strain;
    const d = this.day;
    const fs = s.flowerStart;
    const hd = s.harvestDay;
    const ripeness = clamp((d - (fs + 12)) / (hd - fs - 12));
    const bulk = clamp((d - (fs + 8)) / (hd - fs - 8));
    const grams = Math.round(s.maxYield * Math.pow(bulk, 1.7) * (0.96 + 0.06 * Math.sin(s.seed + d)));
    const amber = Math.round(Math.max(0, (ripeness - 0.72) / 0.28) * 28);
    const clear = Math.round(Math.max(0, 1 - ripeness * 2.2) * 100);
    const milky = Math.max(0, 100 - amber - clear);
    let quality = 'Premium';
    let note = 'Perfekter Erntezeitpunkt – dichter Harzfrost, volles Aroma.';
    if (grams < 1) {
      quality = 'Keine Blüten';
      note = 'Die Pflanze hat noch keine Blüten gebildet. Lass sie weiterwachsen!';
    } else if (ripeness < 0.35) {
      quality = 'Viel zu früh';
      note = 'Die Trichome sind noch klar – kaum Wirkstoff und Aroma.';
    } else if (ripeness < 0.7) {
      quality = 'Zu früh';
      note = 'Noch nicht ausgereift – warte auf milchige bis bernsteinfarbene Trichome.';
    } else if (ripeness < 0.9) {
      quality = 'Gut';
      note = 'Fast reif – etwas mehr Geduld hätte sich gelohnt.';
    }
    this.harvest = { grams, ripeness, clear, milky, amber, quality, note, day: Math.floor(d) };
    this.mode = 'cut';
    this.cutT = 0;
    this.playing = false;
    this.macro = false;
  }

  /* ------------------------------ Größe ------------------------------ */
  applySize() {
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const aspect = rect.width > 10 && rect.height > 10 ? rect.width / rect.height : 16 / 9;
    this.aspect = clamp(aspect, 1.1, 2.6);
    const H = this.quality;
    const W = Math.round(H * this.aspect);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    for (const cam of [this.cam, this.hcam]) {
      cam.W = W;
      cam.H = H;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /* ------------------------------ Frame ------------------------------ */
  private frame(now: number) {
    const dt = Math.min(0.05, Math.max(0.0001, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    const s = this.strain;

    if (this.mode === 'grow' && this.playing) {
      this.day = Math.min(s.harvestDay, this.day + dt * this.speed);
      if (this.day >= s.harvestDay) this.playing = false;
    }
    if (this.mode === 'cut') {
      this.cutT += dt;
      if (this.cutT > 5) this.mode = 'done';
    }

    if (this.autoRot && this.time > this.autoPauseUntil && !this.macro) this.rotBase += dt * 0.11;
    const cam = this.cam;
    cam.rot = this.rotBase + this.userRot;
    cam.update();

    // Makro-Zoom
    const colaOK = this.day > s.flowerStart + 16;
    const macroTarget = this.macro && colaOK && this.mode === 'grow' ? 1 : 0;
    this.macroT += (macroTarget - this.macroT) * (1 - Math.exp(-dt * 3.2));

    this.plant.prepare(this.day, this.time, cam);
    this.updateCamera(dt);

    this.draw();
    pumpSprites(4.5);

    if (now - this.lastEmit > 90) {
      this.lastEmit = now;
      this.emit(false);
    }
  }

  private updateCamera(dt: number) {
    const cam = this.cam;
    const H = cam.H;
    const plant = this.plant;
    const groundY = H * 0.9;
    const V0 = Math.max(56, plant.topY * 1.03 + 4);
    const s0 = ((H * 0.78) / V0) * this.zoomUser;
    const Vm = 30 / this.zoomUser;
    const s1 = (H * 0.8) / Vm;
    const m = smooth(this.macroT);
    const tS = Math.exp(lerp(Math.log(s0), Math.log(s1), m));
    const cy0 = (groundY - H / 2) / tS;
    const cy1 = plant.colaCenterY * cam.cosT;
    const tCY = lerp(cy0, cy1, m);
    if (this.camS === 0) {
      this.camS = tS;
      this.camCY = tCY;
    } else {
      const k = 1 - Math.exp(-dt * 5);
      this.camS += (tS - this.camS) * k;
      this.camCY += (tCY - this.camCY) * k;
    }
    cam.s = this.camS;
    cam.cy = this.camCY;

    // Kamera für die Ernte-Szene
    const h = this.hcam;
    h.rot = 0;
    h.update();
    h.s = H * 0.01;
    h.cy = 40;
  }

  private draw() {
    const ctx = this.ctx;
    const cam = this.cam;
    const { W, H } = cam;
    const day = this.day;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (this.mode === 'done') {
      this.drawDone(1);
      return;
    }

    cam.post.on = false;
    drawBackground(ctx, cam);
    drawPot(ctx, cam, day);

    if (this.mode === 'grow') {
      this.plant.render(ctx, cam, this.time);
    } else {
      this.drawCut();
    }

    // Wurzelzone
    const pTarget = this.mode === 'grow' && this.macroT < 0.3 ? 1 : 0;
    this.panelAlpha += (pTarget - this.panelAlpha) * 0.12;
    const bh = H * 0.31;
    const bw = bh * 1.08;
    drawRootPanel(ctx, { x: W * 0.022, y: H * 0.2, w: bw, h: bh }, day, this.strain, this.roots, this.plant.H, this.panelAlpha);

    if (this.mode === 'cut') {
      const f = smooth((this.cutT - 3.3) / 1.4);
      if (f > 0.001) this.drawDone(f);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawDone(alpha: number) {
    const ctx = this.ctx;
    const h = this.harvest;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    drawBackground(ctx, this.hcam);
    ctx.globalAlpha = 1;
    const amount = h ? clamp(h.grams / this.strain.maxYield) : 0;
    const dneed = h && h.grams > 0 ? 1 : 0;
    drawHarvestScene(ctx, this.hcam, this.strain, h ? Math.max(h.ripeness, 0.08) : 1, this.time, alpha, amount * dneed);
  }

  private drawCut() {
    const ctx = this.ctx;
    const cam = this.cam;
    const plant = this.plant;
    const t = this.cutT;
    const { W, H } = cam;
    cam.post.on = false;
    const piv = cam.project(0, SOIL + CUT_H, 0);

    const fallT = clamp((t - 1.0) / 1.5);
    const theta = 1.5 * fallT * fallT;
    const slide = smooth((t - 1.5) / 1.4);
    const cutDone = t >= 1.0;

    // 1) Stumpf
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, piv[1], W, H - piv[1]);
    ctx.clip();
    plant.render(ctx, cam, this.time);
    ctx.restore();

    // 2) fallender Pflanzenteil
    const tx = slide * cam.s * 34;
    const ty = slide * cam.s * (SOIL + CUT_H) * 0.95;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (cutDone) {
      ctx.translate(piv[0] + tx, piv[1] + ty);
      ctx.rotate(theta);
      ctx.beginPath();
      ctx.rect(-W * 3, -H * 3, W * 6, H * 3);
      ctx.clip();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      cam.post = { on: true, c: Math.cos(theta), s: Math.sin(theta), px: piv[0], py: piv[1], tx, ty };
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, W, piv[1]);
      ctx.clip();
    }
    plant.render(ctx, cam, this.time);
    cam.post.on = false;
    ctx.restore();

    // 3) Schere
    const open = t < 0.5 ? 0.55 : 0.55 * (1 - smooth((t - 0.5) / 0.4));
    const inT = smooth(t / 0.5);
    const outT = smooth((t - 1.2) / 0.7);
    const off = (1 - inT + outT) * cam.s * 38;
    this.drawShears(piv[0] - off, piv[1], cam.s * 0.9, open);
  }

  private drawShears(x: number, y: number, k: number, open: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, x, y);
    ctx.scale(k, k);
    // Griffe
    ctx.lineCap = 'round';
    for (const sg of [-1, 1]) {
      ctx.save();
      ctx.rotate(sg * (open * 0.9 + 0.12));
      ctx.strokeStyle = '#b3201f';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-24, 0);
      ctx.stroke();
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(-36, 0);
      ctx.stroke();
      ctx.restore();
    }
    // Klingen
    for (const sg of [-1, 1]) {
      ctx.save();
      ctx.rotate(sg * open);
      const g = ctx.createLinearGradient(0, -3, 0, 3);
      g.addColorStop(0, '#f3f6f8');
      g.addColorStop(0.5, '#9aa4ab');
      g.addColorStop(1, '#4b535a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-8, -2.2);
      ctx.lineTo(16, -1.6);
      ctx.quadraticCurveTo(22, 0, 24, 1.2);
      ctx.lineTo(-8, 2.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#2c3237';
    ctx.beginPath();
    ctx.arc(-4, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private emit(force: boolean) {
    void force;
    this.onUpdate({
      day: this.day,
      mode: this.mode,
      playing: this.playing,
      speed: this.speed,
      autoRot: this.autoRot,
      macro: this.macro,
      fps: this.fps,
      quality: this.quality,
      height: this.plant.H,
      ripe: this.plant.ripe,
      buds: this.plant.budCount,
      harvest: this.harvest,
      cutT: this.cutT,
      resolution: `${this.canvas.width}×${this.canvas.height}`,
    });
  }
}
