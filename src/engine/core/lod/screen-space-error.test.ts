import { describe, expect, it } from "vitest";
import { computeScreenSpaceError, shouldRefineByScreenSpaceError } from "./screen-space-error";

describe("screen-space error LOD metric", () => {
  it("projects geometric error to pixels", () => {
    const near = computeScreenSpaceError({
      geometricErrorMeters: 100,
      distanceMeters: 1_000,
      viewportHeight: 900,
      fov: Math.PI / 4,
    });
    const far = computeScreenSpaceError({
      geometricErrorMeters: 100,
      distanceMeters: 10_000,
      viewportHeight: 900,
      fov: Math.PI / 4,
    });

    expect(near).toBeGreaterThan(far);
    expect(near / far).toBeCloseTo(10, 5);
  });

  it("keeps zero-error leaf tiles renderable", () => {
    expect(
      computeScreenSpaceError({
        geometricErrorMeters: 0,
        distanceMeters: 1,
        viewportHeight: 900,
        fov: Math.PI / 4,
      }),
    ).toBe(0);
  });

  it("treats a view inside the tile volume as needing refinement", () => {
    const error = computeScreenSpaceError({
      geometricErrorMeters: 100,
      distanceMeters: 0,
      viewportHeight: 900,
      fov: Math.PI / 4,
    });

    expect(error).toBe(Number.POSITIVE_INFINITY);
    expect(shouldRefineByScreenSpaceError(error, 16)).toBe(true);
  });

  it("refines when error reaches the configured pixel budget", () => {
    expect(shouldRefineByScreenSpaceError(15.99, 16)).toBe(false);
    expect(shouldRefineByScreenSpaceError(16, 16)).toBe(true);
  });
});
