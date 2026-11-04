export class Cam {
  W = 1920;
  H = 1080;
  s = 10; // px pro cm
  cy = 40; // "oben"-Koordinate (cm) in Bildmitte
  rot = 0;
  tilt = 0.32; // Kamera blickt leicht von oben
  cosR = 1;
  sinR = 0;
  cosT = Math.cos(0.32);
  sinT = Math.sin(0.32);
  /** Nachgeschaltete 2D-Drehung (für die fallende Pflanze bei der Ernte) */
  post = { on: false, c: 1, s: 0, px: 0, py: 0, tx: 0, ty: 0 };

  update() {
    this.cosR = Math.cos(this.rot);
    this.sinR = Math.sin(this.rot);
    this.cosT = Math.cos(this.tilt);
    this.sinT = Math.sin(this.tilt);
  }

  /** Weltpunkt (cm) → [sx, sy, tiefe] */
  project(x: number, y: number, z: number): [number, number, number] {
    const xr = x * this.cosR + z * this.sinR;
    const zr = -x * this.sinR + z * this.cosR;
    const up = y * this.cosT - zr * this.sinT;
    let sx = this.W / 2 + xr * this.s;
    let sy = this.H / 2 - (up - this.cy) * this.s;
    const p = this.post;
    if (p.on) {
      const dx = sx - p.px;
      const dy = sy - p.py;
      sx = p.px + dx * p.c - dy * p.s + p.tx;
      sy = p.py + dx * p.s + dy * p.c + p.ty;
    }
    return [sx, sy, zr];
  }

  /** Richtungsvektor → Bildschirmvektor in px pro Längeneinheit */
  lin(x: number, y: number, z: number): [number, number] {
    const xr = x * this.cosR + z * this.sinR;
    const zr = -x * this.sinR + z * this.cosR;
    const up = y * this.cosT - zr * this.sinT;
    let vx = xr * this.s;
    let vy = -up * this.s;
    const p = this.post;
    if (p.on) {
      const nx = vx * p.c - vy * p.s;
      const ny = vx * p.s + vy * p.c;
      vx = nx;
      vy = ny;
    }
    return [vx, vy];
  }
}
