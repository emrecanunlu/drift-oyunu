import { describe, it, expect } from "vitest";
import { rollFromGravity, angleDelta, steerFromRoll, lowPass } from "../src/steering";

describe("steering", () => {
  it("maps roll to steer with deadzone and clamp", () => {
    expect(steerFromRoll(0, 0)).toBe(0);
    expect(steerFromRoll(2, 0)).toBe(0);
    expect(steerFromRoll(45, 0)).toBe(1);
    expect(steerFromRoll(-45, 0)).toBe(-1);
    expect(steerFromRoll(90, 0)).toBe(1);
    expect(steerFromRoll(24, 0)).toBeCloseTo(0.5);
  });
  it("respects calibration center", () => {
    expect(steerFromRoll(55, 10)).toBe(1);
  });
  it("wraps around ±180", () => {
    expect(angleDelta(179, -179)).toBeCloseTo(-2);
    expect(angleDelta(-179, 179)).toBeCloseTo(2);
    expect(steerFromRoll(-179, 179)).toBe(0);
  });
  it("computes roll from gravity", () => {
    expect(rollFromGravity(0, 9.81)).toBeCloseTo(0);
    expect(rollFromGravity(9.81, 0)).toBeCloseTo(90);
  });
  it("low-pass filters", () => {
    expect(lowPass(0, 1, 0.25)).toBe(0.25);
  });
});
