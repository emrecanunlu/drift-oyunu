import { describe, it, expect } from "vitest";
import { ScoreSystem, type ScoreEvent } from "../src/sim/score";

const DT = 1 / 60;
function run(s: ScoreSystem, secs: number, drifting: boolean, slip = 0.5, speed = 30) {
  const ev: ScoreEvent[] = [];
  for (let i = 0; i < Math.round(secs * 60); i++) ev.push(...s.update(DT, drifting, slip, speed));
  return ev;
}

describe("ScoreSystem", () => {
  it("accumulates pending points while drifting", () => {
    const s = new ScoreSystem();
    run(s, 2, true);
    expect(s.pending).toBeCloseTo(300, 0);
    expect(s.total).toBe(0);
    expect(s.multiplier).toBe(1);
  });
  it("banks the combo after the window", () => {
    const s = new ScoreSystem();
    run(s, 2, true);
    const ev = run(s, 1.6, false);
    expect(s.total).toBeCloseTo(300, -1);
    expect(s.pending).toBe(0);
    expect(ev).toContain("comboEnd");
  });
  it("chains drifts into a multiplier", () => {
    const s = new ScoreSystem();
    const ev = [...run(s, 1, true), ...run(s, 1, false), ...run(s, 1, true), ...run(s, 1, false), ...run(s, 1, true)];
    expect(s.multiplier).toBe(3);
    expect(ev.filter((e) => e === "comboUp")).toHaveLength(2);
  });
  it("caps multiplier at 10", () => {
    const s = new ScoreSystem();
    for (let i = 0; i < 12; i++) { run(s, 0.5, true); run(s, 0.5, false); }
    expect(s.multiplier).toBe(10);
  });
  it("cancelCombo drops pending without an event", () => {
    const s = new ScoreSystem();
    run(s, 1, true);
    s.cancelCombo();
    const ev = run(s, 2, false);
    expect(s.total).toBe(0);
    expect(ev).not.toContain("comboEnd");
  });
  it("tracks best", () => {
    const s = new ScoreSystem(1000);
    run(s, 1, true); run(s, 2, false);
    expect(s.best).toBe(1000);
    for (let i = 0; i < 6; i++) { run(s, 1, true); run(s, 2, false); }
    expect(s.best).toBe(s.total);
    expect(s.total).toBeGreaterThan(1000);
  });
});
