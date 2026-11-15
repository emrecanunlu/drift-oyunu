export type Tier = { label: string; color: string };

const TIERS: Tier[] = [
  { label: "DRIFT", color: "#ffffff" },
  { label: "GÜZEL", color: "#ffe066" },
  { label: "SÜPER", color: "#ffb03a" },
  { label: "HARİKA", color: "#ff7a3a" },
  { label: "MÜTHİŞ", color: "#ff4a6a" },
  { label: "ÇILGIN", color: "#ff3ea5" },
  { label: "ÇILGIN", color: "#d23eff" },
  { label: "EFSANE", color: "#8a5bff" },
  { label: "EFSANE", color: "#3ea8ff" },
  { label: "TANRISAL", color: "#3ef2ff" },
];

export function comboTier(multiplier: number): Tier {
  return TIERS[Math.min(TIERS.length, Math.max(1, Math.round(multiplier))) - 1];
}
