import { TUNING, type Tuning } from "./tuning";

/** heading 0 = +z, forward = (sin h, cos h), right = (-cos h, sin h) as seen from a chase camera. */
export type CarState = { x: number; z: number; heading: number; vx: number; vz: number; yawRate: number; drifting: boolean };
export type CarInput = { steer: number; brake: boolean; nitro: boolean };

export function createCar(x: number, z: number, heading: number, speed: number): CarState {
  return { x, z, heading, vx: Math.sin(heading) * speed, vz: Math.cos(heading) * speed, yawRate: 0, drifting: false };
}

export function speedOf(c: CarState): number {
  return Math.hypot(c.vx, c.vz);
}

function axes(h: number) {
  return { fx: Math.sin(h), fz: Math.cos(h), rx: -Math.cos(h), rz: Math.sin(h) };
}

/** Signed angle between heading and velocity (rad). */
export function slipAngle(c: CarState): number {
  if (speedOf(c) < 1) return 0;
  const { fx, fz, rx, rz } = axes(c.heading);
  return Math.atan2(c.vx * rx + c.vz * rz, c.vx * fx + c.vz * fz);
}

export function stepCar(c: CarState, input: CarInput, dt: number, t: Tuning = TUNING): CarState {
  const speed = speedOf(c);
  // Steering → yaw. Positive steer turns right on screen (heading decreases).
  let targetYaw = -input.steer * Math.min(t.maxSteerRate, speed * t.steerSpeedGain);
  if (c.drifting) targetYaw *= t.driftYawBoost;
  const yawRate = c.yawRate + (targetYaw - c.yawRate) * Math.min(1, t.yawResponse * dt);
  const heading = c.heading + yawRate * dt;

  const { fx, fz, rx, rz } = axes(heading);
  const vLong = c.vx * fx + c.vz * fz;
  let vLat = c.vx * rx + c.vz * rz;

  // Grip rotates velocity toward heading (lateral damping); speed magnitude is controlled separately.
  vLat *= Math.exp(-(c.drifting ? t.gripDrift : t.gripNormal) * dt);
  let dx = fx * vLong + rx * vLat;
  let dz = fz * vLong + rz * vLat;
  const dl = Math.hypot(dx, dz);
  if (dl > 1e-6) {
    dx /= dl;
    dz /= dl;
  } else {
    dx = fx;
    dz = fz;
  }
  // Cap the drift angle so the car can never spin around.
  const slipNow = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  if (Math.abs(slipNow) > t.maxSlip) {
    const a = Math.sign(slipNow) * t.maxSlip;
    dx = fx * Math.cos(a) + rx * Math.sin(a);
    dz = fz * Math.cos(a) + rz * Math.sin(a);
  }

  // Auto throttle on total speed.
  let target = input.brake ? t.minBrakeSpeed : input.nitro ? t.cruiseSpeed * t.nitroFactor : t.cruiseSpeed;
  if (c.drifting) target = Math.max(t.minBrakeSpeed, target * t.driftSpeedFactor);
  const newSpeed =
    speed < target
      ? Math.min(target, speed + t.accel * dt)
      : Math.max(target, speed - (input.brake ? t.brakeDecel : t.coastDecel) * dt);

  const vx = dx * newSpeed;
  const vz = dz * newSpeed;
  const next: CarState = { x: c.x + vx * dt, z: c.z + vz * dt, heading, vx, vz, yawRate, drifting: c.drifting };

  const slip = Math.abs(slipAngle(next));
  if (!c.drifting && slip > t.driftEnterSlip && newSpeed > t.driftMinSpeed) next.drifting = true;
  else if (c.drifting && (slip < t.driftExitSlip || newSpeed < t.driftMinSpeed * 0.8)) next.drifting = false;
  return next;
}
