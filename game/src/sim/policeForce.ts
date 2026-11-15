import { stepCar, createCar, speedOf, type CarState } from "./car";
import { TUNING, type Tuning } from "./tuning";
import type { Road, RoadPoint } from "./road";

/** Seconds of pursuit after the last crash. */
export const CHASE_TIME = 20;
const ACTIVATE_RANGE = 220;
const SPAWN_BEHIND = 120;
const GONE = 250;
const FOLLOW_GAP = 8;
const MAX_CATCHUP = 18;

export type PoliceUnit = {
  car: CarState;
  state: "parked" | "chasing" | "leaving";
  /** Lateral lane offset it aims for while driving (m). */
  lane: number;
  /** Distance along the road. */
  s: number;
};

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Police cars: parked at the roadside until a crash, then they drive the same car physics as the
 * player, steering at a point ahead on the road (so they slide through corners too).
 */
export class PoliceForce {
  units: PoliceUnit[] = [];
  private heat = 0;
  private count = 0;

  park(p: RoadPoint, halfWidth: number): PoliceUnit {
    const side = this.count++ % 2 === 0 ? 1 : -1;
    const off = side * (halfWidth + 3);
    const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
    const u: PoliceUnit = {
      car: createCar(p.x + nx * off, p.z + nz * off, p.heading, 0),
      state: "parked",
      lane: side * 3.5,
      s: p.s,
    };
    this.units.push(u);
    return u;
  }

  get chasing(): boolean {
    return this.units.some((u) => u.state === "chasing");
  }

  alert(player: CarState, road: Road): void {
    this.heat = CHASE_TIME;
    const ps = road.nearest(player.x, player.z).point.s;
    for (const u of this.units) {
      if (u.state === "leaving" || (u.state === "parked" && Math.abs(u.s - ps) < ACTIVATE_RANGE)) u.state = "chasing";
    }
    if (!this.chasing) {
      const p = road.pointAt(ps - SPAWN_BEHIND) ?? road.points[0];
      const side = this.count++ % 2 === 0 ? 1 : -1;
      this.units.push({
        car: createCar(p.x, p.z, p.heading, speedOf(player)),
        state: "chasing",
        lane: side * 3.5,
        s: p.s,
      });
    }
  }

  update(dt: number, player: CarState, road: Road): void {
    if (this.heat > 0) {
      this.heat -= dt;
      if (this.heat <= 0) for (const u of this.units) if (u.state === "chasing") u.state = "leaving";
    }
    const ps = road.nearest(player.x, player.z).point.s;
    const pSpeed = speedOf(player);
    this.units = this.units.filter((u) => u.s > ps - GONE && road.pointAt(u.s) !== null);

    for (const u of this.units) {
      if (u.state === "parked") continue;
      u.s = road.nearest(u.car.x, u.car.z).point.s;
      const speed = speedOf(u.car);
      const gap = ps - u.s;

      // Speed: catch up while chasing (limited by the corner ahead), fall back when leaving.
      let target = u.state === "chasing"
        ? gap < -5
          ? pSpeed * 0.6 // ended up ahead: let the player come by
          : pSpeed + Math.max(-12, Math.min(MAX_CATCHUP, (gap - FOLLOW_GAP) * 0.9))
        : pSpeed * 0.55;
      const a = road.pointAt(u.s + 10), b = road.pointAt(u.s + 30);
      if (a && b) {
        const k = Math.abs(wrap(b.heading - a.heading)) / 20;
        if (k > 1e-4) target = Math.min(target, (0.85 * TUNING.maxSteerRate) / k);
      }
      target = Math.max(6, target);

      // Steering: pure pursuit to a point ahead in its lane.
      const look = road.pointAt(u.s + 12 + speed * 0.35) ?? road.points[road.points.length - 1];
      const lane = u.state === "leaving" ? u.lane * 2 : u.lane;
      const tx = look.x + Math.cos(look.heading) * lane;
      const tz = look.z - Math.sin(look.heading) * lane;
      const diff = wrap(Math.atan2(tx - u.car.x, tz - u.car.z) - u.car.heading);
      const steer = Math.max(-1, Math.min(1, -diff * 2.4));

      const t: Tuning = { ...TUNING, cruiseSpeed: target, accel: 14, coastDecel: 10 };
      u.car = stepCar(u.car, { steer, brake: false, nitro: false }, dt, t);
    }
  }

  /** Distance to the nearest active unit, or Infinity. */
  nearestDistance(player: CarState): number {
    let d = Infinity;
    for (const u of this.units) {
      if (u.state !== "parked") d = Math.min(d, Math.hypot(u.car.x - player.x, u.car.z - player.z));
    }
    return d;
  }

  /** 0..1 siren loudness from the nearest active unit. */
  sirenLevel(player: CarState): number {
    const d = this.nearestDistance(player);
    return d === Infinity ? 0 : Math.max(0, Math.min(1, 1 - (d - 10) / 200));
  }
}
