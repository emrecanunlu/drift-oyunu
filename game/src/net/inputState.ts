import type { InputMsg } from "@drift/shared";

export const STALE_MS = 500;
export const STALE_RETURN_RATE = 2;

export type ReadInput = { steer: number; brake: boolean; nitro: boolean; stale: boolean };

export class InputState {
  private steer = 0;
  private brake = false;
  private nitro = false;
  private last = -Infinity;
  private calibrate = false;

  apply(msg: InputMsg, now: number): void {
    this.steer = msg.steer;
    this.brake = msg.brake;
    this.nitro = msg.nitro;
    this.last = now;
  }

  read(now: number, dt: number): ReadInput {
    if (now - this.last <= STALE_MS) {
      return { steer: this.steer, brake: this.brake, nitro: this.nitro, stale: false };
    }
    const step = STALE_RETURN_RATE * dt;
    this.steer = Math.abs(this.steer) <= step ? 0 : this.steer - Math.sign(this.steer) * step;
    return { steer: this.steer, brake: false, nitro: false, stale: true };
  }

  requestCalibrate(): void {
    this.calibrate = true;
  }

  consumeCalibrate(): boolean {
    const c = this.calibrate;
    this.calibrate = false;
    return c;
  }
}
