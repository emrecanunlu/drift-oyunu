import { comboTier } from "./comboTier";

const RING = 2 * Math.PI * 44;
const fmt = (n: number) => Math.round(n).toLocaleString("tr-TR");

/** Big centre-screen combo: multiplier in a draining ring, tier word, pop/glow/fly effects. */
export class ComboFx {
  private root = document.getElementById("combo")!;
  private label = this.root.querySelector(".label") as HTMLElement;
  private mult = this.root.querySelector(".mult") as HTMLElement;
  private pts = this.root.querySelector(".pts") as HTMLElement;
  private ring = this.root.querySelector(".fg") as SVGCircleElement;
  private glow = document.getElementById("glow")!;
  private shown = false;
  private lastMult = 0;

  constructor() {
    this.ring.style.strokeDasharray = String(RING);
  }

  update(pending: number, multiplier: number, timeLeft: number): void {
    const show = pending > 0;
    if (show !== this.shown) {
      this.shown = show;
      if (show) this.root.classList.remove("lost");
      this.root.style.opacity = show ? "1" : "0";
    }
    if (!show) return;
    const tier = comboTier(multiplier);
    if (multiplier !== this.lastMult) {
      this.lastMult = multiplier;
      this.root.style.setProperty("--c", tier.color);
      this.label.textContent = tier.label;
      this.mult.textContent = `x${multiplier}`;
    }
    this.pts.textContent = fmt(pending);
    this.ring.style.strokeDashoffset = String(RING * (1 - timeLeft));
  }

  /** Multiplier went up. */
  up(multiplier: number): void {
    this.restart(this.root, "pop");
    this.glow.style.setProperty("--c", comboTier(multiplier).color);
    this.restart(this.glow, "flash");
  }

  /** Combo banked: points fly to the total. */
  bank(amount: number, multiplier: number): void {
    const fly = document.createElement("div");
    fly.className = "fly";
    fly.textContent = `+${fmt(amount)}`;
    fly.style.color = comboTier(multiplier).color;
    document.body.appendChild(fly);
    requestAnimationFrame(() => fly.classList.add("go"));
    setTimeout(() => fly.remove(), 900);
    const total = document.querySelector("#hud .total") as HTMLElement | null;
    if (total) setTimeout(() => this.restart(total, "pulse"), 650);
    this.lastMult = 0;
  }

  /** Combo lost by going off-road. */
  lost(): void {
    if (!this.shown) return;
    this.label.textContent = "KAYBOLDU";
    this.root.classList.add("lost");
    this.restart(this.root, "shake");
    this.lastMult = 0;
  }

  private restart(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
}
