import { Cam } from './cam';
import type { Strain } from './strains';
import { clamp, easeOut, lerp, mix, rgba, rng, smooth, RGB } from './util';
import {
  BUD_LEVELS,
  BudShape,
  buildBud,
  buildLeaf,
  budKey,
  COLOR_LEVELS,
  getGlintSprite,
  getSprite,
  leafKey,
  queueSprite,
} from './sprites';
import { POT } from './scene';

const SOIL = POT.soilY;

interface BranchDef {
  az: number;
  len: number;
  ang0: number;
  nb: number;
  phase: number;
  v: number;
}

interface NodeDef {
  i: number;
  f: number;
  birth: number;
  th: number;
  phase: number;
  leaflets: number;
  shadeJ: number;
  branches: BranchDef[];
}

type V3 = [number, number, number];

interface LeafObj {
  t: 'leaf';
  z: number;
  p: V3;
  az: number;
  L: V3;
  S: number;
  variant: number;
  colorT: number;
  shade: number;
}
interface BudObj {
  t: 'bud';
  z: number;
  p: V3;
  L: V3;
  size: number;
  shape: BudShape;
  variant: number;
  r: number;
  phase: number;
}
interface LineObj {
  t: 'stem' | 'branch';
  z: number;
  pts: number[];
  widths: number[];
  cols: RGB[];
}
interface PistObj {
  t: 'pist';
  z: number;
  p: V3;
  size: number;
}
type Obj = LeafObj | BudObj | LineObj | PistObj;

const WOOD: RGB = [122, 96, 58];

export class Plant {
  s: Strain;
  nodes: NodeDef[] = [];
  Hf: number;
  objs: Obj[] = [];
  H = 0;
  ripe = 0;
  topY = SOIL;
  colaCenterY = SOIL;
  colaLen = 20;
  colaGrow = 0;
  budCount = 0;

  constructor(s: Strain) {
    this.s = s;
    this.Hf = s.hVeg * (1 + s.stretch);
    const N = s.nodes;
    const rnd = rng(s.seed * 13 + 5);
    for (let i = 0; i < N; i++) {
      const birth = i === 0 ? 4.4 : 8 + (s.flowerStart + 6 - 8) * Math.pow((i - 1) / (N - 2), 0.85);
      const f = i === 0 ? 0.02 : 0.07 + 0.86 * Math.pow((i - 1) / (N - 2), 0.9);
      let leaflets = i === 1 ? 1 : i === 2 ? 3 : i === 3 ? 5 : Math.min(s.maxLeaflets, 5 + 2 * Math.floor((i - 3) / 2));
      if (i > 3) {
        if (f > 0.9) leaflets = Math.max(3, leaflets - 4);
        else if (f > 0.76) leaflets = Math.max(3, leaflets - 2);
      }
      const th = i * (Math.PI / 2) + (rnd() - 0.5) * 0.35;
      const branches: BranchDef[] = [];
      if (i >= 2 && i <= N - 2) {
        for (let q = 0; q < 2; q++) {
          const len = s.branchLen * 1.55 * (0.3 + 0.9 * Math.pow(1 - f, 0.9)) * (0.85 + 0.3 * rnd());
          branches.push({
            az: th + q * Math.PI + (rnd() - 0.5) * 0.25,
            len,
            ang0: ((s.branchAngle + (rnd() - 0.5) * 12) * Math.PI) / 180,
            nb: 3 + Math.floor(len / 20),
            phase: rnd() * 10,
            v: (rnd() * 2) | 0,
          });
        }
      }
      this.nodes.push({ i, f, birth, th, phase: rnd() * 10, leaflets, shadeJ: rnd(), branches });
    }
  }

  height(d: number) {
    const s = this.s;
    const t = clamp((d - 3.5) / (s.flowerStart - 3.5));
    const veg = s.hVeg * Math.pow(t, 1.35);
    const st = smooth((d - s.flowerStart) / 26);
    return veg * (1 + s.stretch * st);
  }

  private nodeY(n: NodeDef, d: number, H: number) {
    if (n.i === 0) return Math.min(H * 0.9, 2.2);
    const yb = this.height(n.birth) * 0.95;
    const yf = n.f * this.Hf;
    const y = yb + (yf - yb) * smooth((d - n.birth) / 30);
    return Math.min(y, H * 0.97);
  }

  private leafT(d: number, f: number, age: number) {
    const s = this.s;
    if (age < 10) return lerp(0, 0.15, clamp(age / 10));
    const fs0 = s.fadeStart - 7 * (1 - f);
    const c = clamp((d - fs0) / (s.harvestDay - fs0));
    const e = Math.pow(c, 1.05) * (1 + 0.3 * (1 - f));
    return clamp(0.15 + 0.85 * clamp(e) * s.fadeMax, 0, 1);
  }

  /** Alle Teile der Pflanze für Tag d berechnen und nach Tiefe sortieren. */
  prepare(d: number, time: number, cam: Cam) {
    const s = this.s;
    const objs = this.objs;
    objs.length = 0;
    const H = this.height(d);
    this.H = H;
    const fs = s.flowerStart;
    const hd = s.harvestDay;
    const rGlob = clamp((d - (fs + 12)) / (hd - fs - 12));
    this.ripe = rGlob;
    const fadeC = clamp((d - s.fadeStart) / (hd - s.fadeStart));
    const wf = smooth((d - fs - 20) / (hd - fs - 20));
    const Hs = Math.max(H, 12);
    const depth = (x: number, z: number) => -x * cam.sinR + z * cam.cosR;

    const sp = (y: number): V3 => {
      const k = y / Hs;
      const mod = Math.min(1, y / 30);
      return [
        Math.sin(time * 0.9 + 0.4) * 0.02 * y * k * k + 0.9 * Math.sin(y * 0.06 + s.seed) * mod,
        y + SOIL,
        Math.cos(time * 0.7) * 0.012 * y * k * k + 0.6 * Math.sin(y * 0.045 + s.seed * 2) * mod,
      ];
    };

    const pushLeaf = (p: V3, az: number, pitch: number, S: number, variant: number, colorT: number, shadeF: number) => {
      const cp = Math.cos(pitch);
      const L: V3 = [cp * Math.cos(az), Math.sin(pitch), cp * Math.sin(az)];
      objs.push({
        t: 'leaf',
        z: depth(p[0], p[2]),
        p,
        az,
        L,
        S,
        variant,
        colorT,
        shade: clamp(shadeF),
      });
    };
    const pushLeafDir = (p: V3, L: V3, S: number, variant: number, colorT: number, shadeF: number) => {
      const m = Math.hypot(L[0], L[1], L[2]) || 1;
      const n: V3 = [L[0] / m, L[1] / m, L[2] / m];
      objs.push({
        t: 'leaf',
        z: depth(p[0], p[2]),
        p,
        az: Math.atan2(n[2], n[0]),
        L: n,
        S,
        variant,
        colorT,
        shade: clamp(shadeF),
      });
    };
    const pushBud = (p: V3, L: V3, size: number, shape: BudShape, variant: number, phase: number) => {
      const m = Math.hypot(L[0], L[1], L[2]) || 1;
      objs.push({
        t: 'bud',
        z: depth(p[0], p[2]) + 0.5,
        p,
        L: [L[0] / m, L[1] / m, L[2] / m],
        size,
        shape,
        variant,
        r: this.ripe,
        phase,
      });
      this.budCount++;
    };
    this.budCount = 0;

    /* ---- Stängel ---- */
    if (H > 0.12) {
      const n = Math.max(4, Math.min(18, Math.ceil(H / 6)));
      const pts: number[] = [];
      const widths: number[] = [];
      const cols: RGB[] = [];
      const wBase = 0.1 + 0.0135 * H;
      const stemCol = mix(s.colors.stem, s.colors.stemFade, fadeC * 0.65);
      const pale: RGB = [196, 224, 150];
      for (let k = 0; k <= n; k++) {
        const y = (H * k) / n;
        const p = sp(y);
        pts.push(p[0], p[1], p[2]);
        const u = y / H;
        widths.push(Math.max(0.1, wBase * (1 - 0.72 * u)));
        const young = clamp(1 - H / 25) * 0.7;
        const wood = smooth((d - 24) / 40) * Math.pow(1 - u, 2.2);
        let c = mix(stemCol, pale, young * (1 - u * 0.3) + 0.12 * u);
        c = mix(c, WOOD, wood * 0.5);
        cols.push(c);
      }
      objs.push({ t: 'stem', z: 0, pts, widths, cols });
    }

    /* ---- Keimblätter ---- */
    if (d >= 4.4 && d < 38) {
      const age = d - 4.4;
      const sz = 2.8 * easeOut(age / 3) * (1 - smooth((d - 27) / 10));
      const y = this.nodeY(this.nodes[0], d, H);
      if (sz > 0.05) {
        const p0 = sp(y);
        for (let q = 0; q < 2; q++) {
          const az = this.nodes[0].th + q * Math.PI + 0.3;
          const pitch = lerp(0.5, -0.15, smooth(age / 8));
          const colT = lerp(0.07, 0.4, smooth((d - 16) / 16));
          pushLeaf([p0[0] + Math.cos(az) * 0.12, p0[1], p0[2] + Math.sin(az) * 0.12], az, pitch, sz, 0, colT, 0.75);
        }
      }
    }

    /* ---- Nodien ---- */
    const bornTop = this.nodes.reduce((m, n) => (n.i > 0 && d >= n.birth ? Math.max(m, n.i) : m), 0);
    for (const n of this.nodes) {
      if (n.i === 0 || d < n.birth) continue;
      const y = this.nodeY(n, d, H);
      const p = sp(y);
      const age = d - n.birth;
      const gl = easeOut(age / 16);
      const prof = Math.min(1, 0.3 + 0.2 * (n.i - 1)) * (1 - 0.55 * smooth((n.f - 0.7) / 0.3));
      const Smax = s.leafSize * 1.3 * prof;
      const zN = clamp(depth(p[0], p[2]) / 30, -1, 1);

      if (gl > 0.03) {
        for (let q = 0; q < 2; q++) {
          const az = n.th + q * Math.PI + Math.sin(time * 0.8 + n.phase + q) * 0.03;
          const pitch =
            lerp(1.1, lerp(-0.3, 0.5, n.f), smooth(age / 32)) + Math.sin(time * 1.3 + n.phase + q * 2) * 0.035;
          const off = 0.35;
          const pos: V3 = [p[0] + Math.cos(az) * off, p[1], p[2] + Math.sin(az) * off];
          const shade = 0.1 + 0.5 * n.f + 0.35 * (0.5 + 0.5 * zN) + 0.12 * n.shadeJ;
          pushLeaf(pos, az, pitch, Smax * (0.2 + 0.8 * gl), n.leaflets, this.leafT(d, n.f, age), shade);
        }
      }

      /* Vorblüte: weiße Härchen */
      if (n.f > 0.3 && d > fs + 2 && d < fs + 20) {
        const g = smooth((d - fs - 2) / 8) * (1 - smooth((d - fs - 14) / 6));
        if (g > 0.05) {
          for (let q = 0; q < 2; q++) {
            const az = n.th + q * Math.PI;
            objs.push({
              t: 'pist',
              z: depth(p[0], p[2]) + 0.3,
              p: [p[0] + Math.cos(az) * 0.5, p[1] + 0.3, p[2] + Math.sin(az) * 0.5],
              size: 1.1 * g,
            });
          }
        }
      }

      /* Blütenstapel am Haupttrieb */
      if (n.f >= 0.36) {
        const d0 = fs + 10 + (1 - n.f) * 14;
        const fb = smooth((d - d0) / (hd - d0));
        if (fb > 0.03) {
          const size = (5 + 11 * clamp((n.f - 0.35) / 0.6)) * s.budSize * fb;
          for (let q = 0; q < 2; q++) {
            const az = n.th + q * Math.PI;
            const pos: V3 = [p[0] + Math.cos(az) * 0.9, p[1] + 0.4, p[2] + Math.sin(az) * 0.9];
            pushBud(pos, [Math.cos(az) * 0.32, 1, Math.sin(az) * 0.32], size, size > 6.5 ? 'side' : 'pop', (n.i + q) % 2, n.phase + q);
          }
        }
      }

      /* ---- Seitenäste ---- */
      for (const b of n.branches) {
        const bage = d - n.birth - 6;
        if (bage <= 0) continue;
        const gb = easeOut(bage / 38) * (1 + 0.3 * smooth((d - fs) / 30));
        const Lt = b.len * gb;
        if (Lt < 1) continue;
        const bx = p[0] + Math.cos(b.az) * 0.4;
        const bz = p[2] + Math.sin(b.az) * 0.4;
        const nseg = 8;
        const pts: number[] = [bx, p[1], bz];
        const raw: V3[] = [[bx, p[1], bz]];
        let x = bx;
        let yv = p[1];
        let z = bz;
        const dirs: V3[] = [[Math.cos(b.ang0) * Math.cos(b.az), Math.sin(b.ang0), Math.cos(b.ang0) * Math.sin(b.az)]];
        for (let k = 1; k <= nseg; k++) {
          const u = k / nseg;
          const e = b.ang0 + (Math.PI / 2 - b.ang0) * 0.42 * Math.pow(u, 1.4) - wf * 0.35 * Math.pow(u, 1.6);
          const dx = Math.cos(e) * Math.cos(b.az);
          const dy = Math.sin(e);
          const dz = Math.cos(e) * Math.sin(b.az);
          x += (dx * Lt) / nseg;
          yv += (dy * Lt) / nseg;
          z += (dz * Lt) / nseg;
          dirs.push([dx, dy, dz]);
          const swx = Math.sin(time * 1.1 + b.phase) * 0.7 * u * u * (Lt / 25);
          const swz = Math.cos(time * 0.9 + b.phase) * 0.5 * u * u * (Lt / 25);
          pts.push(x + swx, yv, z + swz);
          raw.push([x + swx, yv, z + swz]);
        }
        const wb = 0.1 + 0.014 * Lt;
        const widths: number[] = [];
        const cols: RGB[] = [];
        const bc = mix(s.colors.stem, s.colors.stemFade, fadeC * 0.55);
        for (let k = 0; k <= nseg; k++) {
          widths.push(Math.max(0.08, wb * (1 - 0.62 * (k / nseg))));
          cols.push(mix(bc, [200, 226, 160], 0.1 + 0.25 * (k / nseg)));
        }
        const mid = raw[4];
        objs.push({ t: 'branch', z: depth(mid[0], mid[2]), pts, widths, cols });

        const at = (u: number): [V3, V3] => {
          const f = u * nseg;
          const i0 = Math.min(nseg - 1, Math.floor(f));
          const t = f - i0;
          const a = raw[i0];
          const c = raw[i0 + 1];
          const dd = dirs[i0 + 1];
          return [[lerp(a[0], c[0], t), lerp(a[1], c[1], t), lerp(a[2], c[2], t)], dd];
        };

        // Blätter am Ast
        for (let j = 0; j < b.nb; j++) {
          const u = (j + 1) / (b.nb + 1);
          const lage = bage - u * 16;
          const gj = easeOut(lage / 14);
          if (gj < 0.04) continue;
          const [pp, dir] = at(u);
          const leaflets = Math.min(s.maxLeaflets, j === 0 ? 7 : j < 3 ? 5 : 3);
          const S = s.leafSize * 1.3 * (0.62 - 0.3 * u) * (0.55 + 0.45 * (1 - n.f)) * (0.2 + 0.8 * gj);
          for (let q = 0; q < 2; q++) {
            const sg = q === 0 ? 1 : -1;
            const sideAz = b.az + sg * (Math.PI / 2) * (j % 2 ? 0.6 : 1);
            const L: V3 = [
              Math.cos(sideAz) + dir[0] * 0.5,
              0.28 + dir[1] * 0.5 - 0.35 * smooth(lage / 30) + Math.sin(time * 1.3 + b.phase + j + q) * 0.03,
              Math.sin(sideAz) + dir[2] * 0.5,
            ];
            const zN2 = clamp(depth(pp[0], pp[2]) / 30, -1, 1);
            pushLeafDir(
              pp,
              L,
              S,
              leaflets,
              this.leafT(d, n.f, lage + 6),
              0.15 + 0.45 * n.f + 0.35 * (0.5 + 0.5 * zN2) + 0.1 * u + 0.1 * n.shadeJ,
            );
          }
        }

        // Knospen am Ast
        const dT = fs + 9 + (1 - n.f) * 8;
        const fbT = smooth((d - dT) / (hd - dT));
        const endDir = dirs[nseg];
        if (fbT > 0.03) {
          for (let j = 1; j < b.nb; j++) {
            const u = (j + 1) / (b.nb + 1);
            const d0 = fs + 12 + (1 - n.f) * 7 + (b.nb - j) * 1.4;
            const fb = smooth((d - d0) / (hd - d0));
            if (fb < 0.03) continue;
            const [pp, dir] = at(u);
            const sgn = (j + b.v) % 2 ? 1 : -1;
            const sa = b.az + sgn * (Math.PI / 2);
            const size = (3.2 + 0.09 * b.len) * s.budSize * fb;
            pushBud(
              [pp[0] + Math.cos(sa) * 0.7, pp[1] + 0.2, pp[2] + Math.sin(sa) * 0.7],
              [dir[0] * 0.5 + Math.cos(sa) * 0.25, 0.95 - wf * 0.15, dir[2] * 0.5 + Math.sin(sa) * 0.25],
              size,
              'pop',
              (j + b.v) % 2,
              b.phase + j,
            );
          }
          const sizeT = (6 + 0.26 * b.len) * s.budSize * fbT;
          const end = raw[nseg];
          pushBud(
            [end[0] - endDir[0] * 0.15 * sizeT, end[1] - endDir[1] * 0.15 * sizeT, end[2] - endDir[2] * 0.15 * sizeT],
            [endDir[0] * 0.55, 0.9 - wf * 0.35, endDir[2] * 0.55],
            sizeT,
            'side',
            b.v,
            b.phase,
          );
        }
        // Triebspitzen-Blätter
        const tipS = (3.2 + 0.05 * b.len) * (1 - fbT * 0.85) * gb;
        if (tipS > 0.6 && bage > 14) {
          const end = raw[nseg];
          for (let q = 0; q < 2; q++) {
            const sg = q === 0 ? 1 : -1;
            const L: V3 = [endDir[0] * 0.7 + Math.cos(b.az + sg * 1.2) * 0.6, 0.9, endDir[2] * 0.7 + Math.sin(b.az + sg * 1.2) * 0.6];
            pushLeafDir(end, L, tipS, 3, 0.02, 0.8);
          }
        }
      }
    }

    /* ---- Apex-Blätter (junge Triebspitze) ---- */
    const dMain = fs + 8;
    const fbMain = smooth((d - dMain) / (hd - dMain));
    if (d > 9 && H > 0.5) {
      const S = clamp(2.5 + 0.1 * H, 0, 0.5 * s.leafSize) * (1 - Math.min(1, fbMain * 2.5));
      if (S > 0.8) {
        const pa = sp(H);
        const th = (bornTop + 1) * (Math.PI / 2);
        const variant = H > 30 ? 5 : 3;
        for (let q = 0; q < 2; q++) {
          const az = th + q * Math.PI;
          pushLeaf(
            [pa[0], pa[1] - 0.2, pa[2]],
            az,
            1.0 + Math.sin(time * 1.3 + q) * 0.03,
            S,
            Math.min(variant, s.maxLeaflets),
            0.02,
            0.95,
          );
        }
      }
    }

    /* ---- Haupt-Cola ---- */
    const colaLen = (14 + 0.12 * this.Hf) * s.budSize;
    this.colaLen = colaLen;
    this.colaGrow = fbMain;
    if (fbMain > 0.03) {
      const size = colaLen * fbMain;
      const pa = sp(H - 0.12 * size);
      const sx = Math.sin(time * 0.9 + 0.4) * 0.01;
      pushBud(pa, [sx, 1, Math.cos(time * 0.7) * 0.01], size, 'cola', 1, 0);
    }
    this.colaCenterY = SOIL + H + 0.45 * colaLen * fbMain;
    this.topY = SOIL + H + colaLen * fbMain;

    objs.sort((a, b) => a.z - b.z);
  }

  render(ctx: CanvasRenderingContext2D, cam: Cam, time: number) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const s = this.s;
    for (const o of this.objs) {
      switch (o.t) {
        case 'stem':
        case 'branch':
          this.renderLine(ctx, cam, o);
          break;
        case 'leaf':
          this.renderLeaf(ctx, cam, o);
          break;
        case 'bud':
          this.renderBud(ctx, cam, o, time);
          break;
        case 'pist':
          this.renderPist(ctx, cam, o);
          break;
      }
    }
    void s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private renderLine(ctx: CanvasRenderingContext2D, cam: Cam, o: LineObj) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round';
    const n = o.pts.length / 3;
    const P: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const p = cam.project(o.pts[k * 3], o.pts[k * 3 + 1], o.pts[k * 3 + 2]);
      P.push([p[0], p[1]]);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < n - 1; k++) {
        const w = o.widths[k] * cam.s;
        const c = o.cols[k];
        let lw = w;
        let dx = 0;
        if (pass === 0) {
          lw = w * 1.3 + 1.5;
          ctx.strokeStyle = rgba(c, 0.95, 0.35);
        } else if (pass === 1) {
          ctx.strokeStyle = rgba(c, 1, 0.95);
        } else {
          lw = Math.max(0.8, w * 0.3);
          dx = -w * 0.2;
          ctx.strokeStyle = rgba(mix(c, [255, 255, 230], 0.35), 0.6, 1.05);
        }
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(P[k][0] + dx, P[k][1]);
        ctx.lineTo(P[k + 1][0] + dx, P[k + 1][1]);
        ctx.stroke();
      }
    }
  }

  private renderLeaf(ctx: CanvasRenderingContext2D, cam: Cam, o: LeafObj) {
    const s = this.s;
    const P = cam.project(o.p[0], o.p[1], o.p[2]);
    if (o.S * cam.s < 3) return;
    const lv = o.colorT * (COLOR_LEVELS - 1);
    const level = Math.round(lv);
    const dl = lv - level;
    const sh = Math.min(3, Math.floor(o.shade * 4));
    const build = (lvl: number) => () => buildLeaf(s, o.variant, lvl, sh);
    if (dl > 0.12 && level < COLOR_LEVELS - 1) queueSprite(leafKey(s, o.variant, level + 1, sh), build(level + 1));
    else if (dl < -0.12 && level > 0) queueSprite(leafKey(s, o.variant, level - 1, sh), build(level - 1));
    const sprite = getSprite(leafKey(s, o.variant, level, sh), build(level));
    const wv = cam.lin(-Math.sin(o.az), 0, Math.cos(o.az));
    const lv2 = cam.lin(o.L[0], o.L[1], o.L[2]);
    const k = o.S / sprite.unit;
    ctx.setTransform(wv[0] * k, wv[1] * k, -lv2[0] * k, -lv2[1] * k, P[0], P[1]);
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
  }

  private renderBud(ctx: CanvasRenderingContext2D, cam: Cam, o: BudObj, time: number) {
    const s = this.s;
    const hPx = o.size * cam.s;
    if (hPx < 5) return;
    const P = cam.project(o.p[0], o.p[1], o.p[2]);
    const Ls = cam.lin(o.L[0], o.L[1], o.L[2]);
    const m = Math.hypot(Ls[0], Ls[1]) / cam.s;
    const tier = hPx > 560 ? 1024 : hPx > 250 ? 640 : 320;
    const lv = o.r * (BUD_LEVELS - 1);
    const level = Math.round(lv);
    const dl = lv - level;
    const build = (lvl: number) => () => buildBud(s, o.shape, o.variant, tier, lvl);
    if (dl > 0.12 && level < BUD_LEVELS - 1) queueSprite(budKey(s, o.shape, o.variant, tier, level + 1), build(level + 1));
    else if (dl < -0.12 && level > 0) queueSprite(budKey(s, o.shape, o.variant, tier, level - 1), build(level - 1));
    const sprite = getSprite(budKey(s, o.shape, o.variant, tier, level), build(level));
    const ang = Math.atan2(Ls[0], -Ls[1]) + Math.sin(time * 1.1 + o.phase) * 0.012;
    const kx = hPx / sprite.unit;
    const ky = kx * clamp(m, 0.82, 1);
    ctx.setTransform(1, 0, 0, 1, P[0], P[1]);
    ctx.rotate(ang);
    ctx.scale(kx, ky);
    ctx.drawImage(sprite.canvas, -sprite.ox, -sprite.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // funkelnde Trichome
    if (sprite.glints && hPx > 50) {
      const gs = getGlintSprite();
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const fy = clamp(m, 0.82, 1);
      for (let i = 0; i < sprite.glints.length; i++) {
        const g = sprite.glints[i];
        const a = Math.pow(Math.max(0, Math.sin(time * (1.0 + (i % 5) * 0.27) + g.ph + o.phase)), 10);
        if (a < 0.06) continue;
        const gx = g.x * hPx;
        const gy = g.y * hPx * fy;
        const px = P[0] + gx * ca - gy * sa;
        const py = P[1] + gx * sa + gy * ca;
        const r = Math.max(5, hPx * 0.026) * g.sz;
        ctx.globalAlpha = a * 0.95;
        ctx.drawImage(gs, px - r, py - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
  }

  private renderPist(ctx: CanvasRenderingContext2D, cam: Cam, o: PistObj) {
    const P = cam.project(o.p[0], o.p[1], o.p[2]);
    const l = o.size * cam.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(250,244,226,0.95)';
    ctx.lineWidth = Math.max(1, cam.s * 0.07);
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.quadraticCurveTo(P[0] + sg * l * 0.1, P[1] - l * 0.6, P[0] + sg * l * 0.5, P[1] - l);
      ctx.stroke();
    }
  }
}
