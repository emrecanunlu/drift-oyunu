export type EngineSnapshot = { gear: number; load: number; rpm: number };

const CRACKLE_RPM = 4000;
const COOLDOWN = 0.35;

/**
 * Turns engine changes into exhaust events:
 * upshift under load → a pop; lift-off at high rpm → a burst of crackles;
 * downshift → a throttle blip (rev-match) plus a pop.
 */
export class Exhaust {
  private prev: EngineSnapshot | null = null;
  private queue: number[] = []; // seconds until each pending pop
  private cooldown = 0;

  update(dt: number, s: EngineSnapshot): { pops: number; blip: boolean } {
    let blip = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = this.prev;
    if (p && this.cooldown === 0) {
      if (s.gear > p.gear && s.load) this.schedule(1 + (Math.random() < 0.5 ? 1 : 0));
      else if (s.gear < p.gear) {
        blip = true;
        this.schedule(1 + (Math.random() < 0.5 ? 1 : 0));
      } else if (p.load && !s.load && p.rpm > CRACKLE_RPM) this.schedule(3 + Math.floor(Math.random() * 3));
    }
    this.prev = { ...s };

    let pops = 0;
    this.queue = this.queue
      .map((t) => t - dt)
      .filter((t) => {
        if (t <= 0) {
          pops++;
          return false;
        }
        return true;
      });
    return { pops, blip };
  }

  private schedule(n: number) {
    let t = 0;
    for (let i = 0; i < n; i++) {
      this.queue.push(t);
      t += 0.06 + Math.random() * 0.1;
    }
    this.cooldown = COOLDOWN;
  }
}
