const DEG = 180 / Math.PI;

/** Rotation in the screen plane (degrees), from the gravity vector's x/y components. */
export function rollFromGravity(gx: number, gy: number): number {
  return Math.atan2(gx, gy) * DEG;
}

/** a - b wrapped to [-180, 180). */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d < -180) d += 360;
  if (d >= 180) d -= 360;
  return d;
}

export function steerFromRoll(
  roll: number,
  center: number,
  opts: { range?: number; deadzone?: number } = {},
): number {
  const range = opts.range ?? 45;
  const deadzone = opts.deadzone ?? 3;
  const d = angleDelta(roll, center);
  const mag = Math.abs(d);
  if (mag <= deadzone) return 0;
  const v = Math.min(1, (mag - deadzone) / (range - deadzone));
  return Math.sign(d) * v;
}

export function lowPass(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}
