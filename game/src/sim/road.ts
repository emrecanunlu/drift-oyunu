import { mulberry32 } from "./rng";
import type { RoadStyle } from "../world/biomes";

export const DEFAULT_STYLE: RoadStyle = { curvatureScale: 1, straightChance: 0.15 };

export const STEP = 2;
export const MAX_CURVATURE = 1 / 25;
export const MAX_HEADING_DEV = (60 * Math.PI) / 180;
export const AHEAD = 600;
export const BEHIND = 150;
const SOFT_HEADING = (50 * Math.PI) / 180;
/** Max change of curvature per metre (~15 m to go from 0 to full). */
const CURV_RATE = MAX_CURVATURE / 15;

/** heading 0 = +z; direction = (sin h, cos h). */
export type RoadPoint = { s: number; x: number; z: number; heading: number };

export type Nearest = { point: RoadPoint; distance: number; tangentX: number; tangentZ: number };

export class Road {
  readonly halfWidth = 11;
  points: RoadPoint[] = [];
  private rand: () => number;
  private k = 0;
  private targetK = 0;
  private segLeft = 40; // short run-up, then straight into a corner
  private lastSign = 1;
  private hint = 0;

  constructor(seed: number, private style: (s: number) => RoadStyle = () => DEFAULT_STYLE) {
    this.rand = mulberry32(seed);
    this.points.push({ s: 0, x: 0, z: 0, heading: 0 });
  }

  private pickTarget(forceSign?: number) {
    const r = this.rand;
    const s = this.points[this.points.length - 1].s;
    const st = this.style(s);
    if (forceSign === undefined && s > 60 && r() < st.straightChance) {
      this.targetK = 0;
      this.segLeft = r() < 0.3 ? 100 + r() * 60 : 25 + r() * 25;
      return;
    }
    let sign = forceSign ?? (r() < 0.75 ? -this.lastSign : this.lastSign);
    this.lastSign = sign;
    this.targetK = sign * (0.55 + 0.45 * r()) * MAX_CURVATURE * st.curvatureScale;
    this.segLeft = 30 + r() * 40;
  }

  private extend() {
    const p = this.points[this.points.length - 1];
    this.segLeft -= STEP;
    if (this.segLeft <= 0) this.pickTarget();
    // heading where we'd end up if we straightened out now
    const stopHeading = p.heading + (this.k * Math.abs(this.k)) / (2 * CURV_RATE);
    if (Math.abs(stopHeading) >= SOFT_HEADING && Math.sign(this.targetK || this.k) === Math.sign(p.heading)) {
      this.pickTarget(-Math.sign(p.heading));
    }
    const dk = Math.max(-CURV_RATE * STEP, Math.min(CURV_RATE * STEP, this.targetK - this.k));
    this.k += dk;
    const heading = p.heading + this.k * STEP;
    const mid = (p.heading + heading) / 2;
    this.points.push({
      s: p.s + STEP,
      x: p.x + Math.sin(mid) * STEP,
      z: p.z + Math.cos(mid) * STEP,
      heading,
    });
  }

  ensureAhead(s: number): RoadPoint[] {
    const start = this.points.length;
    while (this.points[this.points.length - 1].s < s + AHEAD) this.extend();
    return this.points.slice(start);
  }

  trimBehind(s: number): number {
    let n = 0;
    while (n < this.points.length - 2 && this.points[n].s < s - BEHIND) n++;
    if (n > 0) {
      this.points.splice(0, n);
      this.hint = Math.max(0, this.hint - n);
    }
    return n;
  }

  /** Interpolated centre-line point at distance s, or null if not generated (or trimmed). */
  pointAt(s: number): RoadPoint | null {
    const pts = this.points;
    if (!pts.length || s < pts[0].s || s > pts[pts.length - 1].s) return null;
    const i = Math.min(pts.length - 2, Math.floor((s - pts[0].s) / STEP));
    const a = pts[i], b = pts[i + 1];
    const t = (s - a.s) / STEP;
    return { s, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + (b.heading - a.heading) * t };
  }

  nearest(x: number, z: number): Nearest {
    const pts = this.points;
    const d2 = (i: number) => (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
    let i = Math.min(this.hint, pts.length - 1);
    while (i + 1 < pts.length && d2(i + 1) < d2(i)) i++;
    while (i > 0 && d2(i - 1) < d2(i)) i--;
    this.hint = i;

    // project onto the better adjacent segment
    let best: Nearest | null = null;
    for (const j of [i - 1, i]) {
      if (j < 0 || j + 1 >= pts.length) continue;
      const a = pts[j], b = pts[j + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2));
      const px = a.x + ex * t, pz = a.z + ez * t;
      const dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.distance) {
        const len = Math.sqrt(len2);
        best = {
          point: { s: a.s + STEP * t, x: px, z: pz, heading: a.heading + (b.heading - a.heading) * t },
          distance: dist,
          tangentX: ex / len,
          tangentZ: ez / len,
        };
      }
    }
    if (best) return best;
    const p = pts[i];
    return { point: { ...p }, distance: Math.sqrt(d2(i)), tangentX: Math.sin(p.heading), tangentZ: Math.cos(p.heading) };
  }
}
