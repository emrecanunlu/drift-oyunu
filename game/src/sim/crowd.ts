import type { RoadPoint } from "./road";
import { speedOf, type CarState } from "./car";

export const HIT_RADIUS = 1.7;
const GRAVITY = 22;
const PANIC_RADIUS = 12;

export type Spectator = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Facing (towards the road) and tumble angles. */
  yaw: number; spinX: number; spinZ: number; wx: number; wz: number;
  state: "cheer" | "panic" | "flying" | "down";
  /** Distance along the road of the chunk it belongs to (for trimming). */
  chunkS: number;
  /** 0..1 random, used for look and animation phase. */
  seed: number;
};

/** Spectators lining the road: spawning per road chunk, hit detection and flight. */
export class Crowd {
  people: Spectator[] = [];

  constructor(private halfWidth: number) {}

  /** density: expected groups per 50 m chunk. Returns the new spectators. */
  spawnChunk(pts: RoadPoint[], rand: () => number, density = 0.7): Spectator[] {
    const added: Spectator[] = [];
    let groups = 0;
    while (rand() < density / (groups + 1) && groups < 3) groups++;
    if (density >= 1 && groups === 0) groups = 1;
    for (let g = 0; g < groups; g++) {
      const p = pts[2 + Math.floor(rand() * (pts.length - 4))];
      const side = rand() < 0.5 ? -1 : 1;
      const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
      const tx = Math.sin(p.heading), tz = Math.cos(p.heading);
      const n = 3 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const along = (rand() - 0.5) * 8;
        const out = side * (this.halfWidth + 2 + rand() * 3.5);
        const s: Spectator = {
          x: p.x + nx * out + tx * along,
          y: 0,
          z: p.z + nz * out + tz * along,
          vx: 0, vy: 0, vz: 0,
          yaw: Math.atan2(-nx * side, -nz * side),
          spinX: 0, spinZ: 0, wx: 0, wz: 0,
          state: "cheer",
          chunkS: pts[0].s,
          seed: rand(),
        };
        added.push(s);
      }
    }
    this.people.push(...added);
    return added;
  }

  /** Advances flights; returns spectators newly hit by the car this step. */
  update(dt: number, car: CarState): Spectator[] {
    const hits: Spectator[] = [];
    const speed = speedOf(car);
    for (const p of this.people) {
      if (p.state === "flying") {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.spinX += p.wx * dt;
        p.spinZ += p.wz * dt;
        if (p.y <= 0 && p.vy < 0) {
          p.y = 0;
          if (Math.abs(p.vy) > 6) {
            // One bounce, losing most energy.
            p.vy = -p.vy * 0.3;
            p.vx *= 0.5;
            p.vz *= 0.5;
          } else {
            p.state = "down";
            p.vx = p.vy = p.vz = 0;
            p.spinX = Math.PI / 2;
          }
        }
        continue;
      }
      if (p.state === "down" || speed < 5) continue;
      if (Math.hypot(p.x - car.x, p.z - car.z) > HIT_RADIUS) continue;
      // Launch along the car's travel, up, with a tumble.
      p.state = "flying";
      p.vx = car.vx * 0.75 + (p.x - car.x) * 3;
      p.vz = car.vz * 0.75 + (p.z - car.z) * 3;
      p.vy = 7 + speed * 0.25;
      p.wx = 8 + p.seed * 6;
      p.wz = (p.seed - 0.5) * 10;
      hits.push(p);
    }
    for (const h of hits) {
      for (const q of this.people) {
        if (q.state === "cheer" && Math.hypot(q.x - h.x, q.z - h.z) < PANIC_RADIUS) q.state = "panic";
      }
    }
    return hits;
  }

  /** Drops everyone whose chunk lies before `beforeS`. */
  trim(beforeS: number): void {
    this.people = this.people.filter((p) => p.chunkS >= beforeS);
  }
}
