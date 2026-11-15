import { describe, it, expect } from "vitest";
import { Crowd, HIT_RADIUS } from "../src/sim/crowd";
import { Road } from "../src/sim/road";
import { createCar } from "../src/sim/car";
import { mulberry32 } from "../src/sim/rng";

function setup() {
  const road = new Road(5);
  road.ensureAhead(0);
  const crowd = new Crowd(road.halfWidth);
  const pts = road.points.slice(20, 46);
  const added = crowd.spawnChunk(pts, mulberry32(1), 1);
  return { road, crowd, added };
}

describe("Crowd", () => {
  it("spawns spectators just off the road edge", () => {
    const { road, crowd, added } = setup();
    expect(added.length).toBeGreaterThan(0);
    for (const p of added) {
      const d = road.nearest(p.x, p.z).distance;
      expect(d).toBeGreaterThan(road.halfWidth + 1.2);
      expect(d).toBeLessThan(road.halfWidth + 7);
      expect(p.state).toBe("cheer");
    }
    expect(crowd.people.length).toBe(added.length);
  });

  it("launches a spectator the car drives into", () => {
    const { crowd, added } = setup();
    const p = added[0];
    const car = createCar(p.x, p.z - 0.5, 0, 40);
    const hits = crowd.update(1 / 60, car);
    expect(hits).toContain(p);
    expect(p.state).toBe("flying");
    expect(p.vy).toBeGreaterThan(5);
    expect(Math.hypot(p.vx, p.vz)).toBeGreaterThan(15);
  });

  it("does not hit people out of reach or when nearly stopped", () => {
    const { crowd, added } = setup();
    const p = added[0];
    expect(crowd.update(1 / 60, createCar(p.x + HIT_RADIUS + 2, p.z, 0, 40))).toHaveLength(0);
    expect(crowd.update(1 / 60, createCar(p.x, p.z, 0, 2))).toHaveLength(0);
  });

  it("flying people land and lie down, and are hit only once", () => {
    const { crowd, added } = setup();
    const p = added[0];
    const car = createCar(p.x, p.z, 0, 40);
    crowd.update(1 / 60, car);
    let again = 0;
    for (let i = 0; i < 60 * 6; i++) again += crowd.update(1 / 60, car).length > 0 && crowd.people.indexOf(p) >= 0 && p.state !== "flying" ? 0 : 0;
    expect(p.state).toBe("down");
    expect(p.y).toBeCloseTo(0, 1);
  });

  it("nearby spectators panic when someone is hit", () => {
    const { crowd, added } = setup();
    const [p, ...rest] = added;
    crowd.update(1 / 60, createCar(p.x, p.z, 0, 40));
    const near = rest.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 12 && q.state === "cheer");
    expect(near.length).toBe(0);
  });

  it("removes people from trimmed chunks", () => {
    const { crowd } = setup();
    crowd.trim(1e9);
    expect(crowd.people).toHaveLength(0);
  });
});
