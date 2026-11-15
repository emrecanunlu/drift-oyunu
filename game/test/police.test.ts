import { describe, it, expect } from "vitest";
import { Police, CHASE_TIME } from "../src/sim/police";

const step = (p: Police, secs: number) => { for (let i = 0; i < Math.round(secs * 60); i++) p.update(1 / 60); };

describe("Police", () => {
  it("is off until alerted", () => {
    const p = new Police();
    step(p, 5);
    expect(p.state).toBe("off");
    expect(p.sirenLevel).toBe(0);
  });
  it("closes in after a crash", () => {
    const p = new Police();
    p.alert();
    expect(p.state).toBe("chasing");
    const d0 = p.distance;
    step(p, 6);
    expect(p.distance).toBeLessThan(d0);
    expect(p.distance).toBeGreaterThanOrEqual(-6);
    expect(p.sirenLevel).toBeGreaterThan(0.5);
  });
  it("gives up after CHASE_TIME without new crashes and drops back", () => {
    const p = new Police();
    p.alert();
    step(p, CHASE_TIME + 1);
    expect(p.state).toBe("leaving");
    step(p, 15);
    expect(p.state).toBe("off");
    expect(p.sirenLevel).toBe(0);
  });
  it("a new crash keeps the chase going", () => {
    const p = new Police();
    p.alert();
    step(p, CHASE_TIME - 2);
    p.alert();
    step(p, 5);
    expect(p.state).toBe("chasing");
  });
});

describe("Police alongside", () => {
  it("sometimes pulls level with or slightly ahead of the player (so it is on screen)", () => {
    const p = new Police();
    p.alert();
    let minD = Infinity;
    for (let i = 0; i < 60 * 15; i++) { p.update(1 / 60); minD = Math.min(minD, p.distance); }
    expect(minD).toBeLessThan(2);
  });
});
