import { describe, it, expect } from "vitest";
import { Recovery } from "../src/sim/recovery";
import { Road } from "../src/sim/road";
import { createCar, speedOf } from "../src/sim/car";

const DT = 1 / 60;
function setup(offset: number) {
  const road = new Road(11);
  road.ensureAhead(0);
  const p = road.points[50];
  const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
  const car = createCar(p.x + nx * offset, p.z + nz * offset, p.heading + 1, 30);
  return { road, car, p };
}

describe("Recovery", () => {
  it("does nothing on the road", () => {
    const { road, car } = setup(0);
    expect(new Recovery().update(DT, car, road).started).toBe(false);
  });
  it("puts the car back on the road mid-effect", () => {
    const { road, car, p } = setup(10);
    const r = new Recovery();
    const first = r.update(DT, car, road);
    expect(first.started).toBe(true);
    expect(r.active).toBe(true);
    let c = first.car, starts = 0;
    for (let t = DT; t < 0.35; t += DT) {
      const o = r.update(DT, c, road);
      c = o.car;
      if (o.started) starts++;
    }
    expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeLessThan(1);
    expect(c.heading).toBeCloseTo(p.heading, 1);
    expect(speedOf(c)).toBeCloseTo(15, 0);
    expect(c.drifting).toBe(false);
    for (let t = 0.35; t < 0.65; t += DT) {
      const o = r.update(DT, c, road);
      c = o.car;
      if (o.started) starts++;
    }
    expect(r.active).toBe(false);
    expect(starts).toBe(0);
  });
});
