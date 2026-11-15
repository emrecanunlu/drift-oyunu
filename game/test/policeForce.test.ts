import { describe, it, expect } from "vitest";
import { PoliceForce, CHASE_TIME } from "../src/sim/policeForce";
import { Road } from "../src/sim/road";
import { createCar, type CarState } from "../src/sim/car";

const DT = 1 / 60;

/** Player driving exactly along the road centre at a fixed speed. */
function world() {
  const road = new Road(12);
  let s = 300;
  road.ensureAhead(s);
  const player = (): CarState => {
    const p = road.pointAt(s)!;
    return createCar(p.x, p.z, p.heading, 40);
  };
  const advance = (secs: number, force: PoliceForce, each?: () => void) => {
    for (let i = 0; i < Math.round(secs * 60); i++) {
      s += 40 * DT;
      road.ensureAhead(s);
      road.trimBehind(s);
      force.update(DT, player(), road);
      each?.();
    }
  };
  return { road, player, advance, s: () => s };
}

describe("PoliceForce", () => {
  it("parked cars sit still until there is a crash", () => {
    const w = world();
    const f = new PoliceForce();
    const u = f.park(w.road.pointAt(w.s() + 60)!, w.road.halfWidth);
    const x0 = u.car.x;
    w.advance(1, f);
    expect(u.state).toBe("parked");
    expect(u.car.x).toBe(x0);
  });

  it("a crash activates nearby parked cars, and sends one from behind if none are near", () => {
    const w = world();
    const f = new PoliceForce();
    const near = f.park(w.road.pointAt(w.s() + 80)!, w.road.halfWidth);
    f.alert(w.player(), w.road);
    expect(near.state).toBe("chasing");
    const f2 = new PoliceForce();
    f2.alert(w.player(), w.road);
    expect(f2.units.filter((u) => u.state === "chasing")).toHaveLength(1);
  });

  it("chasing units drive the road and close in on the player", () => {
    const w = world();
    const f = new PoliceForce();
    f.alert(w.player(), w.road);
    const u = f.units[0];
    let maxOff = 0;
    w.advance(15, f, () => {
      maxOff = Math.max(maxOff, w.road.nearest(u.car.x, u.car.z).distance);
    });
    const p = w.player();
    expect(Math.hypot(u.car.x - p.x, u.car.z - p.z)).toBeLessThan(30);
    expect(maxOff).toBeLessThan(w.road.halfWidth + 4);
  });

  it("gives up after CHASE_TIME and the units are removed once far behind", () => {
    const w = world();
    const f = new PoliceForce();
    f.alert(w.player(), w.road);
    w.advance(CHASE_TIME + 1, f);
    expect(f.units.every((u) => u.state === "leaving")).toBe(true);
    w.advance(20, f);
    expect(f.units).toHaveLength(0);
    expect(f.sirenLevel(w.player())).toBe(0);
  });
});

describe("PoliceForce driving quality", () => {
  it("keeps up with the player and does not weave", () => {
    const w = world();
    const f = new PoliceForce();
    f.alert(w.player(), w.road);
    const u = f.units[0];
    w.advance(10, f);
    let speedSum = 0, n = 0, flips = 0, lastSign = 0;
    w.advance(6, f, () => {
      speedSum += Math.hypot(u.car.vx, u.car.vz);
      n++;
      const sg = Math.sign(u.car.yawRate);
      if (Math.abs(u.car.yawRate) > 0.3) {
        if (lastSign && sg !== lastSign) flips++;
        lastSign = sg;
      }
    });
    expect(speedSum / n).toBeGreaterThan(0.8 * 40);
    expect(flips).toBeLessThan(10);
  });
});
