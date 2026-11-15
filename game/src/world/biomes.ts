export const BIOME_LENGTH = 2000;
export const BLEND_LENGTH = 300;

export type RoadStyle = { curvatureScale: number; straightChance: number };
export type Props = "desert" | "city" | "snow" | "autumn";

export type Palette = {
  skyTop: number; skyMid: number; skyHorizon: number;
  fog: number; fogNear: number; fogFar: number;
  ground: number; hill: number; asphalt: number; paint: number;
  sun: number; sunIntensity: number; hemiSky: number; hemiGround: number; hemiIntensity: number;
};

export type Biome = { id: Props; name: string; palette: Palette; road: RoadStyle };

export const BIOMES: Biome[] = [
  {
    id: "desert",
    name: "Gün Batımı Çölü",
    road: { curvatureScale: 0.65, straightChance: 0.3 },
    palette: {
      skyTop: 0x2b1b4a, skyMid: 0xc2557a, skyHorizon: 0xffb36b, fog: 0xf09a6e, fogNear: 60, fogFar: 420,
      ground: 0xc98a5e, hill: 0x8a4a6a, asphalt: 0x3a3340, paint: 0xf4e6d8,
      sun: 0xffa060, sunIntensity: 1.6, hemiSky: 0xffc9a0, hemiGround: 0x3b2a4a, hemiIntensity: 1.1,
    },
  },
  {
    id: "city",
    name: "Neon Şehir",
    road: { curvatureScale: 0.8, straightChance: 0.2 },
    palette: {
      skyTop: 0x05030f, skyMid: 0x1a0b3a, skyHorizon: 0x5a1a6a, fog: 0x2a1040, fogNear: 40, fogFar: 360,
      ground: 0x14101c, hill: 0x1c1430, asphalt: 0x1a1822, paint: 0x3ef2ff,
      sun: 0x8a6cff, sunIntensity: 0.6, hemiSky: 0x6a4aa8, hemiGround: 0x100818, hemiIntensity: 0.9,
    },
  },
  {
    id: "snow",
    name: "Karlı Dağ",
    road: { curvatureScale: 1, straightChance: 0.08 },
    palette: {
      skyTop: 0x6a8fc4, skyMid: 0xa9c4e4, skyHorizon: 0xe8f0fa, fog: 0xdfe8f4, fogNear: 50, fogFar: 320,
      ground: 0xeef3f8, hill: 0xb8c8dc, asphalt: 0x4a4e58, paint: 0xffd84a,
      sun: 0xfff4e0, sunIntensity: 1.3, hemiSky: 0xdde8ff, hemiGround: 0x8a96aa, hemiIntensity: 1.2,
    },
  },
  {
    id: "autumn",
    name: "Sonbahar Ormanı",
    road: { curvatureScale: 0.75, straightChance: 0.18 },
    palette: {
      skyTop: 0x3a5a8a, skyMid: 0xe0a070, skyHorizon: 0xffd29a, fog: 0xe6b080, fogNear: 60, fogFar: 400,
      ground: 0x7a5a2a, hill: 0x6a4a3a, asphalt: 0x3a3632, paint: 0xfff0d0,
      sun: 0xffb070, sunIntensity: 1.5, hemiSky: 0xffd8a8, hemiGround: 0x4a3020, hemiIntensity: 1.1,
    },
  },
];

/** Current biome `a`, next biome `b`, and blend factor t (0 = all a, 1 = all b). */
export function biomeAt(s: number): { a: Biome; b: Biome; t: number; index: number } {
  const n = BIOMES.length;
  const index = Math.floor(Math.max(0, s) / BIOME_LENGTH);
  const local = Math.max(0, s) - index * BIOME_LENGTH;
  const t = Math.min(1, Math.max(0, (local - (BIOME_LENGTH - BLEND_LENGTH)) / BLEND_LENGTH));
  return { a: BIOMES[index % n], b: BIOMES[(index + 1) % n], t, index };
}

export function mixColor(c1: number, c2: number, t: number): number {
  const ch = (c: number, sh: number) => (c >> sh) & 0xff;
  const m = (sh: number) => Math.round(ch(c1, sh) + (ch(c2, sh) - ch(c1, sh)) * t) << sh;
  return m(16) | m(8) | m(0);
}

const COLOR_KEYS = ["skyTop", "skyMid", "skyHorizon", "fog", "ground", "hill", "asphalt", "paint", "sun", "hemiSky", "hemiGround"] as const;
const NUM_KEYS = ["fogNear", "fogFar", "sunIntensity", "hemiIntensity"] as const;

export function blendPalette(a: Palette, b: Palette, t: number): Palette {
  const out = { ...a };
  for (const k of COLOR_KEYS) out[k] = mixColor(a[k], b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
