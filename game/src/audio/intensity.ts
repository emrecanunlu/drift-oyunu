/** Music layers that switch on as the combo multiplier climbs. */
export function musicLayers(multiplier: number) {
  return {
    hat16: multiplier >= 3,
    arpUp: multiplier >= 5,
    kickEveryBeat: multiplier >= 7,
    /** Music bus lowpass: opens up with the combo. */
    cutoff: 1400 + Math.min(10, multiplier) * 550,
  };
}

/** Screen feel for a multiplier: camera shake on combo-up, edge vignette and speed lines. */
export function comboFeel(multiplier: number) {
  const m = Math.max(0, Math.min(10, multiplier));
  return {
    shake: m === 0 ? 0 : 0.12 + m * 0.07,
    vignette: Math.min(1, m / 10),
    lines: m <= 1 ? 0 : Math.min(1, (m - 1) / 7),
    /** FOV pulled in on combo-up (degrees), then released. */
    fovPunch: m === 0 ? 0 : 2 + m * 0.8,
  };
}
