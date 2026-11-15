export const COUNTDOWN = 3;

export type PauseInput = { inputOk: boolean; visible: boolean; keyboard: boolean };
export type PauseState = { running: boolean; paused: boolean; countdown: number | null };

/** Pauses when the controller drops or the tab is hidden; resumes after a 3-2-1 countdown. */
export class PauseControl {
  private mode: "running" | "paused" | "countdown" = "running";
  private left = 0;

  update(dt: number, i: PauseInput): PauseState {
    const healthy = i.visible && (i.keyboard || i.inputOk);
    if (!healthy) this.mode = "paused";
    else if (this.mode === "paused") {
      this.mode = "countdown";
      this.left = COUNTDOWN;
    } else if (this.mode === "countdown") {
      this.left -= dt;
      if (this.left <= 0) this.mode = "running";
    }
    return {
      running: this.mode === "running",
      paused: this.mode === "paused",
      countdown: this.mode === "countdown" ? Math.ceil(this.left - 1e-9) : null,
    };
  }
}
