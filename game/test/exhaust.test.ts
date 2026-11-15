import { describe, it, expect } from "vitest";
import { Exhaust } from "../src/sim/exhaust";

const DT = 1 / 60;
const st = (gear: number, load: number, rpm: number) => ({ gear, load, rpm });

function run(e: Exhaust, secs: number, s: ReturnType<typeof st>) {
  let pops = 0, blips = 0;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    const o = e.update(DT, s);
    pops += o.pops;
    if (o.blip) blips++;
  }
  return { pops, blips };
}

describe("Exhaust", () => {
  it("is quiet at a steady cruise", () => {
    const e = new Exhaust();
    expect(run(e, 3, st(6, 0, 3200)).pops).toBe(0);
  });
  it("pops on an upshift under load", () => {
    const e = new Exhaust();
    run(e, 0.5, st(3, 1, 6200));
    expect(run(e, 0.3, st(4, 1, 4700)).pops).toBeGreaterThanOrEqual(1);
  });
  it("crackles several times on lift-off at high rpm", () => {
    const e = new Exhaust();
    run(e, 0.5, st(5, 1, 5800));
    expect(run(e, 0.8, st(5, 0, 5600)).pops).toBeGreaterThanOrEqual(3);
  });
  it("does not crackle on lift-off at low rpm", () => {
    const e = new Exhaust();
    run(e, 0.5, st(6, 1, 2500));
    expect(run(e, 0.8, st(6, 0, 2400)).pops).toBe(0);
  });
  it("blips the throttle on a downshift", () => {
    const e = new Exhaust();
    run(e, 0.5, st(5, 0, 3000));
    expect(run(e, 0.2, st(4, 0, 3800)).blips).toBe(1);
  });
});
