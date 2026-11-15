/** Speed (m/s) per gear for the engine sound. */
export const GEAR_SPEED = 14;
const MAX_GEAR = 5;

export function engineTone(speed: number, nitro: boolean): { freq: number; gain: number } {
  const gear = Math.min(MAX_GEAR, Math.floor(speed / GEAR_SPEED));
  const within = Math.min(1.4, (speed - gear * GEAR_SPEED) / GEAR_SPEED);
  const freq = (55 + within * 70 + gear * 8) * (nitro ? 1.15 : 1);
  const gain = 0.05 + Math.min(1, speed / 40) * 0.07;
  return { freq, gain };
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
