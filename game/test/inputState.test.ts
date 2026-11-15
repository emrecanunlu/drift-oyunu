import { describe, it, expect } from "vitest";
import { InputState } from "../src/net/inputState";

const msg = (steer: number) => ({ t: "input" as const, steer, brake: true, nitro: true, seq: 1 });

describe("InputState", () => {
  it("returns fresh input", () => {
    const s = new InputState();
    s.apply(msg(0.8), 1000);
    expect(s.read(1100, 0.016)).toEqual({ steer: 0.8, brake: true, nitro: true, stale: false });
  });
  it("goes stale after 500ms and returns steer to center", () => {
    const s = new InputState();
    s.apply(msg(0.8), 1000);
    const r = s.read(1600, 0.1);
    expect(r.stale).toBe(true);
    expect(r.brake).toBe(false);
    expect(r.nitro).toBe(false);
    expect(r.steer).toBeCloseTo(0.6);
  });
  it("recovers when new input arrives", () => {
    const s = new InputState();
    s.apply(msg(0.8), 1000);
    s.read(1600, 0.1);
    s.apply(msg(-0.2), 1700);
    expect(s.read(1710, 0.016).stale).toBe(false);
  });
  it("consumes calibrate once", () => {
    const s = new InputState();
    s.requestCalibrate();
    expect(s.consumeCalibrate()).toBe(true);
    expect(s.consumeCalibrate()).toBe(false);
  });
});
