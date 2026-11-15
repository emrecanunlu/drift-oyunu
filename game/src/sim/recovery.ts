import { createCar, speedOf, type CarState } from "./car";
import type { Road } from "./road";

export const OFFROAD_MARGIN = 2;
export const EFFECT_DURATION = 0.6;

export class Recovery {
  active = false;
  /** 0..1 through the effect; drives blur/flash. */
  progress = 0;
  private elapsed = 0;
  private placed = false;

  update(dt: number, car: CarState, road: Road): { car: CarState; started: boolean } {
    if (!this.active) {
      if (road.nearest(car.x, car.z).distance <= road.halfWidth + OFFROAD_MARGIN) return { car, started: false };
      this.active = true;
      this.elapsed = 0;
      this.progress = 0;
      this.placed = false;
      return { car, started: true };
    }
    this.elapsed += dt;
    this.progress = Math.min(1, this.elapsed / EFFECT_DURATION);
    if (!this.placed && this.elapsed >= EFFECT_DURATION / 2) {
      const n = road.nearest(car.x, car.z);
      car = createCar(n.point.x, n.point.z, Math.atan2(n.tangentX, n.tangentZ), speedOf(car) * 0.5);
      this.placed = true;
    }
    if (this.elapsed >= EFFECT_DURATION) {
      this.active = false;
      this.progress = 0;
    }
    return { car, started: false };
  }
}
