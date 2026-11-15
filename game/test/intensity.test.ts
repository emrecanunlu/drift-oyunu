import { describe, it, expect } from "vitest";
import { musicLayers, comboFeel } from "../src/audio/intensity";
import { ExtremeHint, HINT_AFTER } from "../src/ui/extremeHint";

describe("musicLayers", () => {
  it("calm with no combo", () => {
    const m = musicLayers(0);
    expect(m.hat16).toBe(false);
    expect(m.arpUp).toBe(false);
    expect(m.kickEveryBeat).toBe(false);
  });
  it("adds layers as the multiplier climbs", () => {
    expect(musicLayers(3).hat16).toBe(true);
    expect(musicLayers(5).arpUp).toBe(true);
    expect(musicLayers(7).kickEveryBeat).toBe(true);
    expect(musicLayers(8).cutoff).toBeGreaterThan(musicLayers(2).cutoff);
  });
});

describe("comboFeel", () => {
  it("shakes and pulls in harder as the multiplier rises", () => {
    expect(comboFeel(6).shake).toBeGreaterThan(comboFeel(2).shake);
    expect(comboFeel(6).vignette).toBeGreaterThan(comboFeel(2).vignette);
    expect(comboFeel(10).vignette).toBeLessThanOrEqual(1);
    expect(comboFeel(0).lines).toBe(0);
  });
});

describe("ExtremeHint", () => {
  it("appears after the first banked combo", () => {
    const h = new ExtremeHint();
    expect(h.update(1, { extremeUsed: false, banked: 0 })).toBe(false);
    expect(h.update(1, { extremeUsed: false, banked: 1 })).toBe(true);
  });
  it("appears after a while of normal play even without combos", () => {
    const h = new ExtremeHint();
    let shown = false;
    for (let t = 0; t < HINT_AFTER + 1; t += 1) shown = h.update(1, { extremeUsed: false, banked: 0 });
    expect(shown).toBe(true);
  });
  it("never shows again once extreme has been used", () => {
    const h = new ExtremeHint();
    h.update(1, { extremeUsed: false, banked: 1 });
    expect(h.update(1, { extremeUsed: true, banked: 1 })).toBe(false);
    expect(h.update(100, { extremeUsed: false, banked: 5 })).toBe(false);
  });
});
