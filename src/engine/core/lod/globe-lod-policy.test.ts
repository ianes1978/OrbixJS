import { describe, expect, it } from "vitest";
import { createLodContext, normalizeLodOptions } from "./lod";
import { selectGlobeLodTargets, shouldEqualizeTerrainZoom } from "./globe-lod-policy";

describe("globe LOD policy", () => {
  it("equalizes terrain zoom for nadir-like mid-altitude views", () => {
    const options = normalizeLodOptions({
      imagery: { maxLevel: 18 },
      terrain: { maxLevel: 15 },
    });
    const context = createLodContext(options, {
      cameraDistance: 1.1,
      altitudeMeters: 100_000,
      viewportWidth: 1200,
      viewportHeight: 800,
      fov: Math.PI / 4,
    });
    const targets = selectGlobeLodTargets({
      projectedImageryLevel: 12,
      projectedTerrainLevel: 8,
      metricImageryLevel: 11,
      cameraSlope: 0.95,
      altitudeMeters: 100_000,
      options,
      context,
    });

    expect(targets.equalizedTerrainZoom).toBe(true);
    expect(targets.requestedImageryTargetLevel).toBe(12);
    expect(targets.requestedTerrainTargetLevel).toBe(12);
  });

  it("keeps terrain independent when the view is too oblique", () => {
    expect(
      shouldEqualizeTerrainZoom({
        altitudeMeters: 100_000,
        cameraSlope: 0.3,
      }),
    ).toBe(false);
  });
});
