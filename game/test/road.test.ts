import { describe, it, expect } from "vitest";
import { Road, STEP, MAX_CURVATURE, MAX_HEADING_DEV } from "../src/sim/road";

function drive(road: Road, km: number) {
  const all = [] as { s: number; heading: number }[];
  let maxLen = 0;
  for (let s = 0; s <= km * 1000; s += 50) {
    all.push(...road.ensureAhead(s));
    road.trimBehind(s);
    maxLen = Math.max(maxLen, road.points.length);
  }
  return { all, maxLen };
}

describe("Road", () => {
  it("is deterministic per seed", () => {
    const a = new Road(42), b = new Road(42), c = new Road(7);
    a.ensureAhead(0); b.ensureAhead(0); c.ensureAhead(0);
    expect(a.points).toEqual(b.points);
    expect(a.points.at(-1)).not.toEqual(c.points.at(-1));
  });

  it("generates 600m ahead with 2m spacing and bounded curvature", () => {
    const r = new Road(1);
    r.ensureAhead(0);
    expect(r.points.at(-1)!.s).toBeGreaterThanOrEqual(600);
    for (let i = 1; i < r.points.length; i++) {
      const p = r.points[i - 1], q = r.points[i];
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(STEP, 5);
      expect(Math.abs(q.heading - p.heading) / STEP).toBeLessThanOrEqual(MAX_CURVATURE + 1e-6);
    }
  });

  it("never turns back on itself and keeps memory bounded over 20km", () => {
    const { all, maxLen } = drive(new Road(3), 20);
    for (const p of all) expect(Math.abs(p.heading)).toBeLessThanOrEqual(MAX_HEADING_DEV + 1e-3);
    expect(maxLen).toBeLessThanOrEqual((600 + 150) / STEP + 50);
  });

  it("contains long straights and S-curves", () => {
    const { all } = drive(new Road(5), 20);
    let run = 0, bestRun = 0, signChanges = 0, lastSign = 0;
    for (let i = 1; i < all.length; i++) {
      const k = (all[i].heading - all[i - 1].heading) / STEP;
      run = Math.abs(k) < 0.001 ? run + 1 : 0;
      bestRun = Math.max(bestRun, run);
      if (Math.abs(k) > 0.008) {
        const sg = Math.sign(k);
        if (lastSign && sg !== lastSign) signChanges++;
        lastSign = sg;
      }
    }
    expect(bestRun * STEP).toBeGreaterThanOrEqual(100);
    expect(signChanges).toBeGreaterThan(5);
  });

  it("finds nearest point and lateral distance", () => {
    const r = new Road(9);
    r.ensureAhead(0);
    const p = r.points[100];
    expect(r.nearest(p.x, p.z).distance).toBeCloseTo(0, 3);
    const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
    const n = r.nearest(p.x + nx * 5, p.z + nz * 5);
    expect(n.distance).toBeCloseTo(5, 1);
    expect(n.point.s).toBeCloseTo(p.s, 0);
  });
});
