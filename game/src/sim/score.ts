export const COMBO_WINDOW = 1.5;
export const MAX_MULT = 10;
export const POINTS_RATE = 10;

export type ScoreEvent = "comboUp" | "comboEnd";

export class ScoreSystem {
  total = 0;
  pending = 0;
  multiplier = 1;
  best: number;
  private wasDrifting = false;
  private sinceDrift = Infinity;

  constructor(best = 0) {
    this.best = best;
  }

  update(dt: number, drifting: boolean, slip: number, speed: number): ScoreEvent[] {
    const ev: ScoreEvent[] = [];
    if (drifting) {
      if (!this.wasDrifting && this.pending > 0 && this.sinceDrift <= COMBO_WINDOW && this.multiplier < MAX_MULT) {
        this.multiplier++;
        ev.push("comboUp");
      }
      this.pending += POINTS_RATE * Math.abs(slip) * speed * dt;
      this.sinceDrift = 0;
    } else {
      this.sinceDrift += dt;
      if (this.pending > 0 && this.sinceDrift > COMBO_WINDOW) {
        this.total += Math.round(this.pending * this.multiplier);
        this.pending = 0;
        this.multiplier = 1;
        this.best = Math.max(this.best, this.total);
        ev.push("comboEnd");
      }
    }
    this.wasDrifting = drifting;
    return ev;
  }

  cancelCombo(): void {
    this.pending = 0;
    this.multiplier = 1;
  }
}
