import { describe, it, expect } from "vitest";
import { surfaceAt, tireMix } from "../src/audio/tires";

describe("surfaceAt", () => {
  it("is asphalt on the road, snowy road in snow", () => {
    expect(surfaceAt(true, "desert")).toBe("asphalt");
    expect(surfaceAt(true, "city")).toBe("asphalt");
    expect(surfaceAt(true, "snow")).toBe("snowRoad");
  });
  it("is the biome's ground off the road", () => {
    expect(surfaceAt(false, "desert")).toBe("sand");
    expect(surfaceAt(false, "snow")).toBe("snow");
    expect(surfaceAt(false, "autumn")).toBe("dirt");
    expect(surfaceAt(false, "city")).toBe("gravel");
  });
});

describe("tireMix", () => {
  it("is silent rolling straight on asphalt", () => {
    const m = tireMix("asphalt", false, 0, 40);
    expect(m.screech).toBe(0);
    expect(m.crunch).toBe(0);
  });
  it("screeches on asphalt when drifting, more with slip", () => {
    expect(tireMix("asphalt", true, 0.6, 40).screech).toBeGreaterThan(tireMix("asphalt", true, 0.2, 40).screech);
  });
  it("barely screeches on snow, hisses instead", () => {
    const asphalt = tireMix("asphalt", true, 0.6, 40);
    const snow = tireMix("snowRoad", true, 0.6, 40);
    expect(snow.screech).toBeLessThan(asphalt.screech * 0.5);
    expect(snow.scrub).toBeGreaterThan(asphalt.scrub);
  });
  it("crunches off-road even without drifting, with speed", () => {
    for (const s of ["sand", "dirt", "gravel", "snow"] as const) {
      expect(tireMix(s, false, 0, 30).crunch).toBeGreaterThan(0);
      expect(tireMix(s, false, 0, 30).crunch).toBeGreaterThan(tireMix(s, false, 0, 8).crunch);
      expect(tireMix(s, true, 0.6, 30).screech).toBe(0);
    }
  });
  it("keeps every level within 0..0.3", () => {
    for (const s of ["asphalt", "snowRoad", "sand", "dirt", "gravel", "snow"] as const) {
      const m = tireMix(s, true, 9, 99);
      for (const v of [m.screech, m.scrub, m.crunch]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0.3);
      }
    }
  });
});
