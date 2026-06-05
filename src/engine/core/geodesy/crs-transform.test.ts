import { describe, expect, it } from "vitest";
import {
  cartographicToCoordinate,
  coordinateToCartographic,
  isSupportedCrs,
  transformCoordinate,
} from "./crs-transform";

describe("CRS transformer", () => {
  it("detects supported CRS identifiers", () => {
    expect(isSupportedCrs("EPSG:4326")).toBe(true);
    expect(isSupportedCrs("EPSG:3857")).toBe(true);
    expect(isSupportedCrs("EPSG:25832")).toBe(false);
  });

  it("converts EPSG:4326 degrees into internal cartographic radians", () => {
    const cartographic = coordinateToCartographic({ x: 12.5, y: 42.5, z: 120 }, "EPSG:4326");

    expect(cartographic.lon).toBeCloseTo((12.5 * Math.PI) / 180);
    expect(cartographic.lat).toBeCloseTo((42.5 * Math.PI) / 180);
    expect(cartographic.height).toBe(120);
  });

  it("transforms EPSG:4326 to EPSG:3857 and back", () => {
    const mercator = transformCoordinate({ x: 12.5, y: 42.5, z: 120 }, "EPSG:4326", "EPSG:3857");

    expect(mercator.x).toBeCloseTo(1391493.6, 0);
    expect(mercator.y).toBeCloseTo(5236173.8, 0);
    expect(mercator.z).toBe(120);

    const degrees = transformCoordinate(mercator, "EPSG:3857", "EPSG:4326");
    expect(degrees.x).toBeCloseTo(12.5);
    expect(degrees.y).toBeCloseTo(42.5);
    expect(degrees.z).toBe(120);
  });

  it("projects internal cartographic coordinates to requested CRS", () => {
    const coordinate = cartographicToCoordinate(
      {
        lon: (12.5 * Math.PI) / 180,
        lat: (42.5 * Math.PI) / 180,
        height: 120,
      },
      "EPSG:4326",
    );

    expect(coordinate).toEqual({ x: 12.5, y: 42.5, z: 120 });
  });
});
