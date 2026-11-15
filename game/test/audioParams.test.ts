import { describe, it, expect } from "vitest";
import { engineTone, squealGain, dingPitch, chordAt, midiToHz, GEAR_SPEED } from "../src/audio/params";

describe("audio params", () => {
  it("engine rises within a gear and drops on shift", () => {
    expect(engineTone(0, false).freq).toBeCloseTo(55);
    const low = engineTone(GEAR_SPEED * 0.2, false).freq;
    const high = engineTone(GEAR_SPEED * 0.9, false).freq;
    const shifted = engineTone(GEAR_SPEED * 1.05, false).freq;
    expect(high).toBeGreaterThan(low);
    expect(shifted).toBeLessThan(high);
  });
  it("nitro brightens the engine", () => {
    expect(engineTone(30, true).freq).toBeGreaterThan(engineTone(30, false).freq);
  });
  it("engine gets louder with speed", () => {
    expect(engineTone(40, false).gain).toBeGreaterThan(engineTone(5, false).gain);
  });
  it("squeals only while drifting, more with slip", () => {
    expect(squealGain(false, 0.6)).toBe(0);
    expect(squealGain(true, 0.6)).toBeGreaterThan(squealGain(true, 0.2));
    expect(squealGain(true, 5)).toBeLessThanOrEqual(0.25);
  });
  it("ding rises with multiplier", () => {
    expect(dingPitch(3)).toBeGreaterThan(dingPitch(2));
  });
  it("music cycles Am F C G", () => {
    expect(chordAt(0)[0] % 12).toBe(9); // A
    expect(chordAt(1)[0] % 12).toBe(5); // F
    expect(chordAt(2)[0] % 12).toBe(0); // C
    expect(chordAt(3)[0] % 12).toBe(7); // G
    expect(chordAt(4)).toEqual(chordAt(0));
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});
