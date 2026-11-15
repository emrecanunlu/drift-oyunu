import { describe, it, expect } from "vitest";
import { engineState, squealGain, dingPitch, chordAt, midiToHz, IDLE_RPM, REDLINE } from "../src/audio/params";
import { TUNING } from "../src/sim/tuning";

describe("engine model", () => {
  it("idles when stopped", () => {
    const e = engineState(0, false, false);
    expect(e.rpm).toBeCloseTo(IDLE_RPM, -1);
    expect(e.gear).toBe(1);
  });
  it("keeps rpm between idle and redline at all speeds", () => {
    for (let v = 0; v <= 70; v += 0.5) {
      const e = engineState(v, true, false);
      expect(e.rpm).toBeGreaterThanOrEqual(IDLE_RPM - 1);
      expect(e.rpm).toBeLessThanOrEqual(REDLINE + 1);
    }
  });
  it("shifts up as speed rises and rpm drops on each shift", () => {
    let prev = engineState(0, true, false);
    let shifts = 0;
    for (let v = 0.5; v <= 60; v += 0.5) {
      const e = engineState(v, true, false);
      if (e.gear > prev.gear) {
        shifts++;
        expect(e.rpm).toBeLessThan(prev.rpm);
      }
      expect(e.gear).toBeGreaterThanOrEqual(prev.gear);
      prev = e;
    }
    expect(shifts).toBeGreaterThanOrEqual(4);
  });
  it("cruises calmly: moderate rpm in a high gear", () => {
    const e = engineState(TUNING.cruiseSpeed, false, false);
    expect(e.gear).toBeGreaterThanOrEqual(5);
    expect(e.rpm).toBeGreaterThan(2200);
    expect(e.rpm).toBeLessThan(4000);
  });
  it("is quieter and darker cruising than accelerating", () => {
    const cruise = engineState(30, false, false);
    const load = engineState(30, true, false);
    expect(cruise.gain).toBeLessThan(load.gain);
    expect(cruise.cutoff).toBeLessThan(load.cutoff);
  });
  it("fires at rpm/30 Hz (4 cylinders)", () => {
    const e = engineState(20, true, false);
    expect(e.fireHz).toBeCloseTo(e.rpm / 30);
  });
  it("nitro raises rpm", () => {
    expect(engineState(45, true, true).rpm).toBeGreaterThan(engineState(45, true, false).rpm);
  });
});

describe("other sounds", () => {
  it("squeals only while drifting, more with slip", () => {
    expect(squealGain(false, 0.6)).toBe(0);
    expect(squealGain(true, 0.6)).toBeGreaterThan(squealGain(true, 0.2));
    expect(squealGain(true, 5)).toBeLessThanOrEqual(0.25);
  });
  it("ding rises with multiplier", () => {
    expect(dingPitch(3)).toBeGreaterThan(dingPitch(2));
  });
  it("music cycles Am F C G", () => {
    expect(chordAt(0)[0] % 12).toBe(9);
    expect(chordAt(1)[0] % 12).toBe(5);
    expect(chordAt(2)[0] % 12).toBe(0);
    expect(chordAt(3)[0] % 12).toBe(7);
    expect(chordAt(4)).toEqual(chordAt(0));
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});
