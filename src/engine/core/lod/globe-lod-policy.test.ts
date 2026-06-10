import { describe, expect, it } from "vitest";
import { createLodContext, normalizeLodOptions } from "./lod";
import { selectGlobeLodTargets } from "./globe-lod-policy";

describe("globe LOD policy", () => {
  it("derives imagery and terrain targets independently from the projections", () => {
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

    expect(targets.requestedImageryTargetLevel).toBe(12);
    expect(targets.requestedTerrainTargetLevel).toBe(8);
  });

  it("clamps targets to the configured layer limits", () => {
    const options = normalizeLodOptions({
      imagery: { maxLevel: 10 },
      terrain: { maxLevel: 6 },
    });
    const context = createLodContext(options, {
      cameraDistance: 1.01,
      altitudeMeters: 5_000,
      viewportWidth: 1200,
      viewportHeight: 800,
      fov: Math.PI / 4,
    });
    const targets = selectGlobeLodTargets({
      projectedImageryLevel: 16,
      projectedTerrainLevel: 14,
      metricImageryLevel: 15,
      cameraSlope: 1,
      altitudeMeters: 5_000,
      options,
      context,
    });

    expect(targets.requestedImageryTargetLevel).toBe(10);
    expect(targets.requestedTerrainTargetLevel).toBe(6);
  });
});
