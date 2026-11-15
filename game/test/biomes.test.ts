import { describe, it, expect } from "vitest";
import { BIOMES, BIOME_LENGTH, BLEND_LENGTH, biomeAt, mixColor } from "../src/world/biomes";

describe("biomes", () => {
  it("cycles desert → city → snow → autumn", () => {
    expect(BIOMES.map((b) => b.id)).toEqual(["desert", "city", "snow", "autumn"]);
    expect(biomeAt(10).a.id).toBe("desert");
    expect(biomeAt(BIOME_LENGTH + 10).a.id).toBe("city");
    expect(biomeAt(BIOME_LENGTH * 4 + 10).a.id).toBe("desert");
  });
  it("blends only in the last stretch of each biome", () => {
    expect(biomeAt(BIOME_LENGTH - BLEND_LENGTH - 1).t).toBe(0);
    const mid = biomeAt(BIOME_LENGTH - BLEND_LENGTH / 2);
    expect(mid.a.id).toBe("desert");
    expect(mid.b.id).toBe("city");
    expect(mid.t).toBeCloseTo(0.5);
  });
  it("mixes hex colors", () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
  });
  it("gives each biome a road style within limits", () => {
    for (const b of BIOMES) {
      expect(b.road.curvatureScale).toBeGreaterThan(0);
      expect(b.road.curvatureScale).toBeLessThanOrEqual(1);
    }
    const snow = BIOMES.find((b) => b.id === "snow")!;
    const desert = BIOMES.find((b) => b.id === "desert")!;
    expect(snow.road.curvatureScale).toBeGreaterThan(desert.road.curvatureScale);
    expect(desert.road.straightChance).toBeGreaterThan(snow.road.straightChance);
  });
});
