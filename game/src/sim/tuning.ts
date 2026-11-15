/** All feel constants. Tweak by playing. Units: m, s, rad. */
export const TUNING = {
  cruiseSpeed: 30.56, // ~110 km/h
  minBrakeSpeed: 11.11, // ~40 km/h
  nitroFactor: 1.3,
  accel: 6,
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
  driftMinSpeed: 15,
  /** Target speed multiplier while drifting. */
  driftSpeedFactor: 0.9,
};
export type Tuning = typeof TUNING;
