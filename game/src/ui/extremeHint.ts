/** Seconds of normal play before suggesting extreme mode. */
export const HINT_AFTER = 45;

/** Decides when to suggest extreme mode: after the first banked combo or HINT_AFTER seconds. */
export class ExtremeHint {
  private t = 0;
  private done = false;

  update(dt: number, s: { extremeUsed: boolean; banked: number }): boolean {
    if (s.extremeUsed) this.done = true;
    if (this.done) return false;
    this.t += dt;
    return s.banked > 0 || this.t >= HINT_AFTER;
  }
}
