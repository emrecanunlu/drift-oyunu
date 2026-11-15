export const IDLE_RPM = 900;
export const REDLINE = 7000;
const SHIFT_UP_RPM = 6300;
const CRUISE_MIN_RPM = 2200;
/** Road speed (m/s) at redline in each gear → rpm per m/s. */
const GEAR_TOP = [15, 27, 40, 54, 68, 85];
const RATIO = GEAR_TOP.map((v) => REDLINE / v);

export type EngineState = { rpm: number; gear: number; fireHz: number; gain: number; cutoff: number; load: number };

/**
 * A 6-speed automatic: under load it holds gears to ~6300 rpm; cruising it picks the highest
 * gear that keeps ~2200+ rpm (calm drone). 4-cylinder firing frequency = rpm / 30.
 */
export function engineState(speed: number, accelerating: boolean, nitro: boolean): EngineState {
  const load = accelerating || nitro ? 1 : 0;
  let gear = 1;
  if (load) {
    while (gear < GEAR_TOP.length && speed * RATIO[gear - 1] > SHIFT_UP_RPM) gear++;
  } else {
    gear = GEAR_TOP.length;
    while (gear > 1 && speed * RATIO[gear - 1] < CRUISE_MIN_RPM) gear--;
  }
  let rpm = Math.max(IDLE_RPM, speed * RATIO[gear - 1]);
  if (nitro) rpm += 600;
  rpm = Math.min(REDLINE, rpm);
  const r = rpm / REDLINE;
  return {
    rpm,
    gear,
    fireHz: rpm / 30,
    load,
    gain: (0.035 + 0.045 * r) * (load ? 1.6 : 1),
    cutoff: (250 + rpm * 0.12) * (load ? 1.8 : 1),
  };
}
export function squealGain(drifting: boolean, slip: number): number {
  return drifting ? Math.min(1, Math.abs(slip) / 0.8) * 0.25 : 0;
}

export function dingPitch(multiplier: number): number {
  return 660 * Math.pow(2, ((multiplier - 1) * 2) / 12);
}

/** Am F C G, as MIDI notes (root, third, fifth) around C4. */
const PROGRESSION = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

export function chordAt(bar: number): number[] {
  return PROGRESSION[((bar % 4) + 4) % 4];
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
