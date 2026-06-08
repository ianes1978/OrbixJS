import { describe, expect, it } from "vitest";
import { resolveTerrainImageryFallback } from "./terrain-imagery-fallback";

describe("resolveTerrainImageryFallback", () => {
  it("uses exact imagery when the terrain tile texture is resident", () => {
    const resolved = resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, (id) => id === "6/34/22");

    expect(resolved).toEqual({
      imageryId: "6/34/22",
      uvScale: [1, 1],
      uvOffset: [0, 0],
    });
  });

  it("maps terrain UVs into the nearest resident imagery ancestor", () => {
    const resolved = resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, (id) => id === "4/8/5");

    expect(resolved).toEqual({
      imageryId: "4/8/5",
      uvScale: [0.25, 0.25],
      uvOffset: [0.5, 0.5],
    });
  });

  it("returns undefined when neither exact nor ancestor imagery is resident", () => {
    expect(resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, () => false)).toBeUndefined();
  });
});
