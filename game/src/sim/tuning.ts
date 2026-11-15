/** All feel constants. Tweak by playing. Units: m, s, rad. */
export const TUNING = {
  cruiseSpeed: 47.22, // 170 km/h
  minBrakeSpeed: 11.11, // ~40 km/h
  nitroFactor: 1.4, // 238 km/h
  accel: 10,
  brakeDecel: 9,
  coastDecel: 4,
  /** Max yaw rate from steering (rad/s). */
  maxSteerRate: 2.0,
  /** Yaw rate per m/s of speed at full steer, before the cap. */
  steerSpeedGain: 0.09,
  yawResponse: 12,
  /** Extra yaw while drifting (more angle, NFS feel). */
  driftYawBoost: 1.15,
  /** Lateral velocity damping (1/s). */
  gripNormal: 8,
  gripDrift: 3,
  /** Max drift angle (rad, ~45°) — prevents spinning out. */
  maxSlip: 0.8,
  driftEnterSlip: 0.2,
  driftExitSlip: 0.1,
  /** Slip must stay below driftExitSlip this long (s) before the drift ends — lets you flick side to side. */
  driftExitDelay: 0.4,
  driftMinSpeed: 15,
  /** Target speed multiplier while drifting. */
  driftSpeedFactor: 0.9,
};
export type Tuning = typeof TUNING;

/** Extreme mode: much faster, sharper steering. */
export const EXTREME: Tuning = {
  ...TUNING,
  cruiseSpeed: 55.56, // 200 km/h
  nitroFactor: 1.3, // ~260 km/h
  accel: 16,
  maxSteerRate: 2.5,
  steerSpeedGain: 0.1,
  yawResponse: 14,
};
