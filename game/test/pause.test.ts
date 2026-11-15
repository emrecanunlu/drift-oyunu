import { describe, it, expect } from "vitest";
import { PauseControl, COUNTDOWN } from "../src/sim/pause";

const ok = { inputOk: true, visible: true, keyboard: false };
const step = (p: PauseControl, secs: number, c = ok) => {
  let r = p.update(0, c);
  for (let i = 0; i < Math.round(secs * 60); i++) r = p.update(1 / 60, c);
  return r;
};

describe("PauseControl", () => {
  it("runs while the controller is sending input", () => {
    expect(step(new PauseControl(), 1).running).toBe(true);
  });
  it("pauses when controller input stops", () => {
    const p = new PauseControl();
    step(p, 1);
    const r = step(p, 0.1, { ...ok, inputOk: false });
    expect(r.running).toBe(false);
    expect(r.countdown).toBeNull();
    expect(r.paused).toBe(true);
  });
  it("counts down 3-2-1 after the controller returns, then runs", () => {
    const p = new PauseControl();
    step(p, 1);
    step(p, 1, { ...ok, inputOk: false });
    const r1 = step(p, 0.1);
    expect(r1.running).toBe(false);
    expect(r1.countdown).toBe(3);
    expect(step(p, 1).countdown).toBe(2);
    expect(step(p, 1).countdown).toBe(1);
    expect(step(p, COUNTDOWN).running).toBe(true);
  });
  it("pauses when the game tab is hidden", () => {
    const p = new PauseControl();
    step(p, 1);
    expect(step(p, 0.1, { ...ok, visible: false }).running).toBe(false);
  });
  it("keyboard play is never paused for missing controller input", () => {
    const p = new PauseControl();
    expect(step(p, 1, { inputOk: false, visible: true, keyboard: true }).running).toBe(true);
  });
  it("losing the controller again during the countdown pauses again", () => {
    const p = new PauseControl();
    step(p, 1);
    step(p, 1, { ...ok, inputOk: false });
    step(p, 1);
    const r = step(p, 0.1, { ...ok, inputOk: false });
    expect(r.countdown).toBeNull();
    expect(r.running).toBe(false);
  });
});
