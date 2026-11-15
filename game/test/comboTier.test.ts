import { describe, it, expect } from "vitest";
import { comboTier } from "../src/ui/comboTier";

describe("comboTier", () => {
  it("names and colors each multiplier", () => {
    expect(comboTier(1).label).toBe("DRIFT");
    expect(comboTier(3).label).toBe("SÜPER");
    expect(comboTier(10).label).toBe("TANRISAL");
    expect(comboTier(2).color).not.toBe(comboTier(5).color);
  });
  it("clamps out-of-range multipliers", () => {
    expect(comboTier(0)).toEqual(comboTier(1));
    expect(comboTier(99)).toEqual(comboTier(10));
  });
});
