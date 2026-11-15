import { animate } from "motion";
import { comboTier } from "./comboTier";

const RING = 2 * Math.PI * 44;
const fmt = (n: number) => Math.round(n).toLocaleString("tr-TR");

/**
 * Centre-top combo: multiplier in a draining ring, tier word, and motion-driven effects that
 * get bigger as the multiplier climbs (slam, wobble, word drop, points flying to the total).
 */
export class ComboFx {
  private root = document.getElementById("combo")!;
  private label = this.root.querySelector(".label") as HTMLElement;
  private mult = this.root.querySelector(".mult") as HTMLElement;
  private pts = this.root.querySelector(".pts") as HTMLElement;
  private ring = this.root.querySelector(".fg") as SVGCircleElement;
  private ringBox = this.root.querySelector(".ring") as HTMLElement;
  private glow = document.getElementById("glow")!;
  private total = document.querySelector("#hud .total") as HTMLElement | null;
  private shown = false;
  private lastMult = 0;
  private shownTotal = 0;

  constructor() {
    this.ring.style.strokeDasharray = String(RING);
  }

  update(pending: number, multiplier: number, timeLeft: number): void {
    const show = pending > 0;
    if (show !== this.shown) {
      this.shown = show;
      if (show) {
        this.root.classList.remove("lost");
        animate(this.root, { opacity: [0, 1], scale: [0.6, 1], y: [-20, 0] }, { duration: 0.3, ease: [0.2, 1.6, 0.4, 1] });
      } else if (!this.root.classList.contains("lost")) {
        animate(this.root, { opacity: 0, scale: 0.8 }, { duration: 0.25 });
      }
    }
    if (!show) return;
    const tier = comboTier(multiplier);
    if (multiplier !== this.lastMult) {
      this.lastMult = multiplier;
      this.root.style.setProperty("--c", tier.color);
      this.label.textContent = tier.label;
      this.mult.textContent = `x${multiplier}`;
      // The ring beats faster and bigger the higher you go.
      this.ringBox.style.setProperty("--beat", `${Math.max(0.25, 0.9 - multiplier * 0.065)}s`);
      this.ringBox.style.setProperty("--beatScale", String(1 + multiplier * 0.012));
    }
    this.pts.textContent = fmt(pending);
    this.ring.style.strokeDashoffset = String(RING * (1 - timeLeft));
  }

  /** Multiplier went up: slam the combo, drop the word in, flash the edges. Bigger each time. */
  up(multiplier: number): void {
    const m = Math.min(10, multiplier);
    const s = 1 + m * 0.09;
    animate(this.root, { scale: [s + 0.5, 0.88, s * 0.06 + 1, 1], rotate: [-4 - m, 3 + m * 0.5, -1.5, 0] }, { duration: 0.55 });
    animate(this.mult, { scale: [2.6, 0.9, 1.05, 1] }, { duration: 0.45 });
    animate(this.label, { y: [-34, 4, 0], opacity: [0, 1, 1], scale: [1.6, 0.95, 1] }, { duration: 0.4 });
    this.glow.style.setProperty("--c", comboTier(m).color);
    animate(this.glow, { opacity: [Math.min(1, 0.45 + m * 0.06), 0] }, { duration: 0.35 + m * 0.04 });
  }

  /** Combo banked: points arc up to the total, which counts up and pops. */
  bank(amount: number, multiplier: number): void {
    const from = this.root.getBoundingClientRect();
    const to = this.total?.getBoundingClientRect();
    const fly = document.createElement("div");
    fly.className = "fly";
    fly.textContent = `+${fmt(amount)}`;
    fly.style.color = comboTier(multiplier).color;
    fly.style.left = `${from.left + from.width / 2}px`;
    fly.style.top = `${from.bottom - 40}px`;
    document.body.appendChild(fly);
    const dx = to ? to.right - (from.left + from.width / 2) - 20 : 300;
    const dy = to ? to.top - (from.bottom - 40) : -200;
    animate(
      fly,
      { x: [0, dx * 0.3, dx], y: [0, -60, dy], scale: [1.4, 1.2, 0.5], opacity: [1, 1, 0] },
      { duration: 0.8, ease: "easeIn" },
    ).then(() => fly.remove());

    if (this.total) {
      const el = this.total;
      const start = this.shownTotal;
      const end = start + amount;
      this.shownTotal = end;
      setTimeout(() => {
        animate(start, end, { duration: 0.6, onUpdate: (v) => (el.textContent = fmt(v)) });
        animate(el, { scale: [1.5, 1], color: ["#ffd27a", "#ffffff"] }, { duration: 0.5 });
      }, 650);
    }
    this.lastMult = 0;
  }

  /** Combo lost (off-road or a crash): shake it red and drop it. */
  lost(): void {
    if (!this.shown) return;
    this.label.textContent = "KAYBOLDU";
    this.root.classList.add("lost");
    animate(
      this.root,
      { x: [0, -22, 18, -12, 7, 0], rotate: [0, -8, 6, -3, 0], y: [0, 0, 0, 10, 40], opacity: [1, 1, 1, 0.8, 0] },
      { duration: 0.8 },
    );
    this.lastMult = 0;
  }

  /** Keep the counting display in sync when the total is drawn by the HUD. */
  get displayedTotal(): number {
    return this.shownTotal;
  }
}
