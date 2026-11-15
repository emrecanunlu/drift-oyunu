import { describe, it, expect } from "vitest";
import { DriftBuzz, BUZZ_INTERVAL } from "../src/sim/driftBuzz";

describe("DriftBuzz", () => {
  it("buzzes immediately when a drift starts, then every interval", () => {
    const b = new DriftBuzz();
    expect(b.update(1 / 60, true)).toBe(true);
    let n = 0;
    for (let i = 0; i < 60; i++) if (b.update(1 / 60, true)) n++;
    expect(n).toBe(Math.floor(1 / BUZZ_INTERVAL));
  });
  it("is silent when not drifting", () => {
    const b = new DriftBuzz();
    let n = 0;
    for (let i = 0; i < 60; i++) if (b.update(1 / 60, false)) n++;
    expect(n).toBe(0);
  });
});
