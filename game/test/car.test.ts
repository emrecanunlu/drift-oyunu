import { describe, it, expect } from "vitest";
import { createCar, stepCar, speedOf, slipAngle, type CarState, type CarInput } from "../src/sim/car";
import { TUNING } from "../src/sim/tuning";

const DT = 1 / 60;
function run(car: CarState, input: CarInput, secs: number, each?: (c: CarState) => void) {
  for (let i = 0; i < secs * 60; i++) {
    car = stepCar(car, input, DT);
    each?.(car);
  }
  return car;
}
const IDLE = { steer: 0, brake: false, nitro: false };

describe("car", () => {
  it("auto-throttles to cruise speed", () => {
    const c = run(createCar(0, 0, 0, 0), IDLE, 15);
    expect(speedOf(c)).toBeGreaterThanOrEqual(TUNING.cruiseSpeed - 1.5);
    expect(speedOf(c)).toBeLessThanOrEqual(TUNING.cruiseSpeed + 1.5);
    expect(c.drifting).toBe(false);
  });
  it("nitro adds 30%", () => {
    const c = run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, nitro: true }, 10);
    expect(Math.abs(speedOf(c) - TUNING.cruiseSpeed * TUNING.nitroFactor)).toBeLessThan(1.5);
  });
  it("brake slows to the floor but never stops", () => {
    let min = Infinity;
    const c = run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, brake: true }, 15, (s) => (min = Math.min(min, speedOf(s))));
    expect(Math.abs(speedOf(c) - TUNING.minBrakeSpeed)).toBeLessThan(0.5);
    expect(min).toBeGreaterThanOrEqual(10.5);
  });
  it("full steer at cruise starts a drift", () => {
    let drifted = false;
    run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, steer: 1 }, 3, (s) => {
      if (s.drifting && Math.abs(slipAngle(s)) > TUNING.driftEnterSlip) drifted = true;
    });
    expect(drifted).toBe(true);
  });
  it("does not drift at low speed", () => {
    let drifted = false;
    let c = run(createCar(0, 0, 0, 8), { ...IDLE, brake: true }, 0.1);
    run(c, { steer: 1, brake: true, nitro: false }, 3, (s) => (drifted ||= s.drifting));
    expect(drifted).toBe(false);
  });
  it("recovers from a drift when steering is released", () => {
    let c = run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, steer: 1 }, 2);
    expect(c.drifting).toBe(true);
    c = run(c, IDLE, 3);
    expect(c.drifting).toBe(false);
  });
  it("does not spin", () => {
    let maxYaw = 0, maxSlip = 0;
    run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, steer: 1 }, 5, (s) => {
      maxYaw = Math.max(maxYaw, Math.abs(s.yawRate));
      maxSlip = Math.max(maxSlip, Math.abs(slipAngle(s)));
    });
    expect(maxYaw).toBeLessThanOrEqual(4);
    expect(maxSlip).toBeLessThanOrEqual(TUNING.maxSlip + 1e-6);
  });
});

describe("drift transitions", () => {
  it("keeps drifting when flicking from one side to the other", () => {
    let c = run(createCar(0, 0, 0, TUNING.cruiseSpeed), { ...IDLE, steer: 1 }, 1.5);
    expect(c.drifting).toBe(true);
    const firstSign = Math.sign(slipAngle(c));
    let broke = false;
    c = run(c, { ...IDLE, steer: -1 }, 1.5, (s) => (broke ||= !s.drifting));
    expect(broke).toBe(false);
    expect(Math.sign(slipAngle(c))).toBe(-firstSign);
  });
});

describe("speed targets", () => {
  it("cruises at 170 km/h and nitro reaches 238 km/h", () => {
    expect(TUNING.cruiseSpeed * 3.6).toBeCloseTo(170, 0);
    expect(TUNING.cruiseSpeed * TUNING.nitroFactor * 3.6).toBeCloseTo(238, 0);
  });
  it("reaches cruise from standstill within 6 s", () => {
    const c = run(createCar(0, 0, 0, 0), IDLE, 6);
    expect(speedOf(c)).toBeGreaterThanOrEqual(TUNING.cruiseSpeed - 0.5);
  });
});

describe("extreme mode", () => {
  it("is much faster and steers harder", async () => {
    const { EXTREME } = await import("../src/sim/tuning");
    expect(EXTREME.cruiseSpeed * 3.6).toBeCloseTo(230, 0);
    expect(EXTREME.maxSteerRate).toBeGreaterThan(TUNING.maxSteerRate);
    const c = run(createCar(0, 0, 0, 0), IDLE, 0);
    let x = c;
    for (let i = 0; i < 60 * 10; i++) x = stepCar(x, IDLE, 1 / 60, EXTREME);
    expect(speedOf(x)).toBeGreaterThan(EXTREME.cruiseSpeed - 1);
  });
});
