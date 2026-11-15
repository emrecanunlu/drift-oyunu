import type { Props } from "../world/biomes";

export type Surface = "asphalt" | "snowRoad" | "sand" | "dirt" | "gravel" | "snow";

export function surfaceAt(onRoad: boolean, biome: Props): Surface {
  if (onRoad) return biome === "snow" ? "snowRoad" : "asphalt";
  return { desert: "sand", city: "gravel", snow: "snow", autumn: "dirt" }[biome] as Surface;
}

/** Per surface: how much it screeches, hisses (scrub) and crunches, and the crunch/scrub colour. */
const SURFACES: Record<Surface, { screech: number; scrub: number; crunch: number; crunchHz: number; scrubHz: number }> = {
  asphalt: { screech: 1, scrub: 0.35, crunch: 0, crunchHz: 0, scrubHz: 2200 },
  snowRoad: { screech: 0.25, scrub: 0.9, crunch: 0.3, crunchHz: 900, scrubHz: 3500 },
  sand: { screech: 0, scrub: 0.6, crunch: 0.8, crunchHz: 500, scrubHz: 1400 },
  dirt: { screech: 0, scrub: 0.4, crunch: 1, crunchHz: 380, scrubHz: 1000 },
  gravel: { screech: 0, scrub: 0.3, crunch: 1, crunchHz: 1200, scrubHz: 2600 },
  snow: { screech: 0, scrub: 0.8, crunch: 0.7, crunchHz: 700, scrubHz: 3000 },
};

export type TireMix = { screech: number; scrub: number; crunch: number; crunchHz: number; scrubHz: number };

export function tireMix(surface: Surface, drifting: boolean, slip: number, speed: number): TireMix {
  const s = SURFACES[surface];
  const slide = drifting ? Math.min(1, Math.abs(slip) / 0.7) : 0;
  const roll = Math.min(1, speed / 40);
  const clamp = (v: number) => Math.max(0, Math.min(0.3, v));
  return {
    screech: clamp(s.screech * slide * (0.6 + 0.4 * roll) * 0.22),
    scrub: clamp(s.scrub * slide * 0.12 + (surface === "asphalt" ? 0 : s.scrub * roll * 0.04)),
    crunch: clamp(s.crunch * roll * (0.12 + slide * 0.14)),
    crunchHz: s.crunchHz,
    scrubHz: s.scrubHz,
  };
}
