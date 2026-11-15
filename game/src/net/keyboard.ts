/** Development fallback: arrows drive the car without a phone. */
export class Keyboard {
  private keys = new Set<string>();
  constructor() {
    addEventListener("keydown", (e) => this.keys.add(e.key));
    addEventListener("keyup", (e) => this.keys.delete(e.key));
  }
  get active(): boolean {
    return this.keys.size > 0;
  }
  read() {
    const steer = (this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("ArrowLeft") ? 1 : 0);
    return { steer, brake: this.keys.has("ArrowDown"), nitro: this.keys.has("ArrowUp") };
  }
}
