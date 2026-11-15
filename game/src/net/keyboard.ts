const DRIVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * Development fallback: arrows drive the car without a phone.
 * Only arrow keys count as "keyboard driving" (so M/E don't steal control from the phone),
 * and everything is released when the window loses focus — the keyup would never arrive.
 */
export class Keyboard {
  private keys = new Set<string>();

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (DRIVE_KEYS.has(k)) this.keys.add(k);
    });
    target.addEventListener("keyup", (e) => this.keys.delete((e as KeyboardEvent).key));
    target.addEventListener("blur", () => this.keys.clear());
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this.keys.clear());
    }
  }

  get active(): boolean {
    return this.keys.size > 0;
  }

  read() {
    const steer = (this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("ArrowLeft") ? 1 : 0);
    return { steer, brake: this.keys.has("ArrowDown"), nitro: this.keys.has("ArrowUp") };
  }
}
