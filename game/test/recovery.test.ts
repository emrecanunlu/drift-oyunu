import { describe, it, expect } from "vitest";
import { Recovery, OFFROAD_GRACE, FAR_MARGIN } from "../src/sim/recovery";
import { Road } from "../src/sim/road";
import { createCar, speedOf, type CarState } from "../src/sim/car";

const DT = 1 / 60;
function setup(offset: number) {
  const road = new Road(11);
  road.ensureAhead(0);
  const p = road.points[50];
  const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
  const car = createCar(p.x + nx * offset, p.z + nz * offset, p.heading + 1, 30);
  return { road, car, p };
}
function hold(r: Recovery, car: CarState, road: Road, secs: number) {
  let started = 0;
  for (let t = 0; t < secs - 1e-9; t += DT) {
    const o = r.update(DT, car, road);
    car = o.car;
    if (o.started) started++;
  }
  return { car, started };
}

describe("Recovery", () => {
  it("does nothing on the road", () => {
    const { road, car } = setup(0);
    expect(hold(new Recovery(), car, road, 3).started).toBe(0);
  });
  it("tolerates going a few metres off the road briefly", () => {
    const { road, car } = setup(12); // 5 m past the edge
    const r = new Recovery();
    expect(hold(r, car, road, OFFROAD_GRACE - 0.2).started).toBe(0);
    expect(r.active).toBe(false);
  });
  it("recovers after staying off the road longer than the grace period", () => {
    const { road, car } = setup(12);
    const r = new Recovery();
    expect(hold(r, car, road, OFFROAD_GRACE + 0.1).started).toBe(1);
    expect(r.active).toBe(true);
  });
  it("recovers immediately when far from the road", () => {
    const { road, car } = setup(road0HalfWidth() + FAR_MARGIN + 1);
    const r = new Recovery();
    expect(r.update(DT, car, road).started).toBe(true);
  });
  it("puts the car back on the road mid-effect, once", () => {
    const { road, car, p } = setup(30);
    const r = new Recovery();
    const first = r.update(DT, car, road);
    expect(first.started).toBe(true);
    let { car: c, started } = hold(r, first.car, road, 0.35);
    expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeLessThan(1);
    expect(c.heading).toBeCloseTo(p.heading, 1);
    expect(speedOf(c)).toBeCloseTo(15, 0);
    expect(c.drifting).toBe(false);
    const rest = hold(r, c, road, 0.3);
    expect(r.active).toBe(false);
    expect(started + rest.started).toBe(0);
  });
});

function road0HalfWidth() {
  return new Road(1).halfWidth;
}
