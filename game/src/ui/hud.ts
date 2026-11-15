const fmt = (n: number) => Math.round(n).toLocaleString("tr-TR");

export class Hud {
  private total: HTMLElement;
  private best: HTMLElement;
  private combo: HTMLElement;
  private speed: HTMLElement;
  private banner = document.getElementById("stale")!;

  constructor() {
    const root = document.getElementById("hud")!;
    root.innerHTML = `<div class="total"></div><div class="best"></div><div class="combo"></div><div class="speed"></div>`;
    [this.total, this.best, this.combo, this.speed] = Array.from(root.children) as HTMLElement[];
  }

  update(total: number, best: number, pending: number, mult: number, kmh: number): void {
    this.total.textContent = fmt(total);
    this.best.textContent = `En iyi ${fmt(best)}`;
    this.combo.style.opacity = pending > 0 ? "1" : "0";
    if (pending > 0) this.combo.innerHTML = `+${fmt(pending)}<span class="mult">x${mult}</span>`;
    this.speed.textContent = `${Math.round(kmh)} km/s`;
  }

  /** Shows a biome name in the middle of the screen for a few seconds. */
  showBiome(name: string): void {
    const el = document.getElementById("biome")!;
    el.textContent = name;
    el.style.opacity = "1";
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (el.style.opacity = "0"), 3000);
  }
  private bannerTimer: ReturnType<typeof setTimeout> | undefined;

  /** null hides the banner. */
  message(text: string | null): void {
    this.banner.style.display = text ? "flex" : "none";
    if (text) this.banner.textContent = text;
  }
}

export function setRecoveryFx(canvas: HTMLCanvasElement, progress: number): void {
  const k = progress > 0 ? Math.sin(Math.PI * progress) : 0;
  canvas.style.filter = k > 0.01 ? `blur(${(k * 8).toFixed(1)}px)` : "";
  document.getElementById("flash")!.style.opacity = (k * 0.8).toFixed(2);
}
