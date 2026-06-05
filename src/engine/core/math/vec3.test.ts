import { describe, expect, it } from "vitest";
import { cross, distance, dot, normalize } from "./vec3";

describe("vec3", () => {
  it("normalizes vectors", () => {
    expect(normalize([0, 3, 4])).toEqual([0, 0.6, 0.8]);
  });

  it("computes dot, cross and distance", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(distance([0, 0, 0], [0, 3, 4])).toBe(5);
  });
});
