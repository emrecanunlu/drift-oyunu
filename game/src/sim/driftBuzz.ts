/** Seconds between phone buzzes while drifting. */
export const BUZZ_INTERVAL = 0.12;

/** Decides when to send a "drift" haptic: once on drift start, then every BUZZ_INTERVAL. */
export class DriftBuzz {
  private since = Infinity;

  update(dt: number, drifting: boolean): boolean {
    if (!drifting) {
      this.since = Infinity;
      return false;
    }
    this.since += dt;
    if (this.since >= BUZZ_INTERVAL) {
      this.since = this.since === Infinity ? 0 : this.since - BUZZ_INTERVAL;
      return true;
    }
    return false;
  }
}
