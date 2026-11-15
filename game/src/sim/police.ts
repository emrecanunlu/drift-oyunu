/** Seconds of chase after the last crash. */
export const CHASE_TIME = 20;
const START_DISTANCE = 140;
const CLOSEST = 16;
const GONE = 220;

/** A police car that follows behind (distance along the road) after a crash. */
export class Police {
  state: "off" | "chasing" | "leaving" = "off";
  /** Metres behind the player. */
  distance = START_DISTANCE;
  private timer = 0;
  private t = 0;

  alert(): void {
    if (this.state !== "chasing") {
      if (this.state === "off") this.distance = START_DISTANCE;
      this.state = "chasing";
    }
    this.timer = CHASE_TIME;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.state === "chasing") {
      this.timer -= dt;
      // Close in, then surge between ~14 m behind and pulling level (on screen).
      const target = CLOSEST - 11 + 13 * Math.sin(this.t * 0.5);
      this.distance += (target - this.distance) * Math.min(1, 0.8 * dt);
      if (this.timer <= 0) this.state = "leaving";
    } else if (this.state === "leaving") {
      this.distance += 18 * dt;
      if (this.distance >= GONE) {
        this.state = "off";
        this.distance = START_DISTANCE;
      }
    }
  }

  /** 0..1 loudness of the siren from distance. */
  get sirenLevel(): number {
    if (this.state === "off") return 0;
    return Math.max(0, Math.min(1, 1 - (this.distance - CLOSEST) / (GONE - CLOSEST)));
  }
}
