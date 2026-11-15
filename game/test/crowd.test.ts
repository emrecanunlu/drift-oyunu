import { describe, it, expect } from "vitest";
import { Crowd, HIT_RADIUS } from "../src/sim/crowd";
import { Road } from "../src/sim/road";
import { createCar } from "../src/sim/car";
import { mulberry32 } from "../src/sim/rng";

function setup() {
  const road = new Road(5);
  road.ensureAhead(0);
  const crowd = new Crowd(road.halfWidth);
  const added = crowd.spawnChunk(road.points.slice(20, 46), mulberry32(1), 1);
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

  it("throws a hit spectator forward at about car speed, low not high", () => {
    const { crowd, added } = setup();
    const p = added[0];
    const hits = crowd.update(1 / 60, createCar(p.x, p.z - 0.5, 0, 40));
    expect(hits).toContain(p);
    expect(p.state).toBe("flying");
    expect(p.vy).toBeGreaterThan(1.5);
    expect(p.vy).toBeLessThan(8);
    expect(p.vz).toBeGreaterThan(0.8 * 40);
  });

  it("tumbles and slides along the ground, then comes to rest", () => {
    const { crowd, added } = setup();
    const p = added[0];
    const x0 = p.x, z0 = p.z;
    crowd.update(1 / 60, createCar(p.x, p.z, 0, 40));
    let contacts = 0, wasAir = true;
    for (let i = 0; i < 60 * 8; i++) {
      crowd.update(1 / 60, createCar(1e6, 1e6, 0, 0));
      if (p.y <= 0.001 && wasAir) contacts++;
      wasAir = p.y > 0.001;
    }
    expect(contacts).toBeGreaterThanOrEqual(2);
    expect(p.state).toBe("down");
    expect(p.y).toBeCloseTo(0, 2);
    const dist = Math.hypot(p.x - x0, p.z - z0);
    expect(dist).toBeGreaterThan(15);
    expect(dist).toBeLessThan(120);
  });

  it("does not hit people out of reach or when nearly stopped", () => {
    const { crowd, added } = setup();
    const p = added[0];
    expect(crowd.update(1 / 60, createCar(p.x + HIT_RADIUS + 2, p.z, 0, 40))).toHaveLength(0);
    expect(crowd.update(1 / 60, createCar(p.x, p.z, 0, 2))).toHaveLength(0);
  });

  it("nearby spectators panic when someone is hit", () => {
    const { crowd, added } = setup();
    const [p, ...rest] = added;
    crowd.update(1 / 60, createCar(p.x, p.z, 0, 40));
    expect(rest.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 12 && q.state === "cheer")).toHaveLength(0);
  });

  it("removes people from trimmed chunks", () => {
    const { crowd } = setup();
    crowd.trim(1e9);
    expect(crowd.people).toHaveLength(0);
  });
});
