import { describe, expect, it } from "vitest";
import {
  applyLodBiasToLevel,
  createAdaptiveLodState,
  createLodContext,
  normalizeLodOptions,
  stabilizeLodLevel,
  updateAdaptiveLodState,
} from "./lod";

describe("LOD policy", () => {
  it("normalizes the balanced profile by default", () => {
    const lod = normalizeLodOptions(undefined);

    expect(lod.profile).toBe("balanced");
    expect(lod.adaptive).toBe(true);
    expect(lod.maxVisibleTiles).toBeGreaterThan(300);
    expect(lod.terrain.maxTiles).toBeGreaterThan(100);
    expect(lod.terrain.maxTiles).toBeLessThan(lod.maxVisibleTiles / 2);
  });

  it("orders profile budgets from performance to ultra", () => {
    const performance = normalizeLodOptions("performance");
    const balanced = normalizeLodOptions("balanced");
    const ultra = normalizeLodOptions("ultra");

    expect(performance.maxVisibleTiles).toBeLessThan(balanced.maxVisibleTiles);
    expect(balanced.maxVisibleTiles).toBeLessThan(ultra.maxVisibleTiles);
    expect(performance.pixelErrorBudget).toBeGreaterThan(ultra.pixelErrorBudget);
  });

  it("degrades quickly and recovers slowly when adaptive mode is enabled", () => {
    const options = normalizeLodOptions({ profile: "balanced", adaptive: true });
    let state = createAdaptiveLodState();

    for (let index = 0; index < 10; index += 1) {
      state = updateAdaptiveLodState(state, 28, options);
    }

    expect(state.qualityReduction).toBeGreaterThan(0.5);

    const degraded = state.qualityReduction;

    for (let index = 0; index < 4; index += 1) {
      state = updateAdaptiveLodState(state, 10, options);
    }

    expect(state.qualityReduction).toBeLessThan(degraded);
    expect(state.qualityReduction).toBeGreaterThan(0);
  });

  it("converts adaptive state into frame budgets", () => {
    const options = normalizeLodOptions({ profile: "balanced", adaptive: true });
    const base = createLodContext(options, {
      cameraDistance: 1.01,
      altitudeMeters: 1000,
      viewportWidth: 1200,
      viewportHeight: 800,
      devicePixelRatio: 2,
      fov: Math.PI / 4,
      adaptiveState: { qualityReduction: 0 },
    });
    const degraded = createLodContext(options, {
      cameraDistance: 1.01,
      altitudeMeters: 1000,
      viewportWidth: 1200,
      viewportHeight: 800,
      devicePixelRatio: 2,
      fov: Math.PI / 4,
      adaptiveState: { qualityReduction: 2 },
    });

    expect(degraded.pixelErrorBudget).toBeGreaterThan(base.pixelErrorBudget);
    expect(degraded.tileBudget).toBeLessThan(base.tileBudget);
    expect(degraded.requestBudget).toBeLessThan(base.requestBudget);
    expect(degraded.qualityBias).toBeGreaterThan(base.qualityBias - 1);
  });

  it("applies quality bias while respecting layer limits", () => {
    const options = normalizeLodOptions({
      profile: "quality",
      imagery: { minLevel: 4, maxLevel: 10, lodBias: 1 },
    });
    const context = createLodContext(options, {
      cameraDistance: 1.01,
      altitudeMeters: 1000,
      viewportWidth: 1200,
      viewportHeight: 800,
      fov: Math.PI / 4,
    });

    expect(applyLodBiasToLevel(7, options.imagery, context)).toBe(9);
    expect(applyLodBiasToLevel(12, options.imagery, context)).toBe(10);
  });

  it("stabilizes target LOD changes across frames", () => {
    expect(stabilizeLodLevel(undefined, 7)).toBe(7);
    expect(stabilizeLodLevel(7, 2)).toBe(6);
    expect(stabilizeLodLevel(2, 7)).toBe(3);
    expect(stabilizeLodLevel(7, undefined)).toBe(7);
    expect(stabilizeLodLevel(7, 2, { maxDrop: 2 })).toBe(5);
  });
});
