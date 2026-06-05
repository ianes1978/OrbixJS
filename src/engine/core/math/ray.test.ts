import { describe, expect, it } from "vitest";
import { intersectUnitSphere } from "./ray";

describe("ray", () => {
  it("intersects a unit sphere", () => {
    const hit = intersectUnitSphere({
      origin: [0, 0, 3],
      direction: [0, 0, -1],
    });

    expect(hit?.[2]).toBeCloseTo(1);
  });
});
