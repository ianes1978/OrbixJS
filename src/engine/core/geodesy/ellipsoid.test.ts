import { describe, expect, it } from "vitest";
import { Ellipsoid } from "./ellipsoid";

describe("Ellipsoid", () => {
  it("exposes WGS84 radii", () => {
    expect(Ellipsoid.WGS84.radii[0]).toBeCloseTo(6378137);
    expect(Ellipsoid.WGS84.radii[1]).toBeCloseTo(6356752.314245179);
    expect(Ellipsoid.WGS84.radii[2]).toBeCloseTo(6378137);
  });

  it("converts cartographic coordinates to cartesian positions", () => {
    const equator = Ellipsoid.WGS84.cartographicToCartesian({ lon: 0, lat: 0 });
    const east = Ellipsoid.WGS84.cartographicToCartesian({ lon: Math.PI / 2, lat: 0 });
    const northPole = Ellipsoid.WGS84.cartographicToCartesian({ lon: 0, lat: Math.PI / 2 });

    expect(equator[0]).toBeCloseTo(Ellipsoid.WGS84.radii[0]);
    expect(equator[1]).toBeCloseTo(0);
    expect(equator[2]).toBeCloseTo(0);
    expect(east[0]).toBeCloseTo(0);
    expect(east[2]).toBeCloseTo(-Ellipsoid.WGS84.radii[2]);
    expect(northPole[1]).toBeCloseTo(Ellipsoid.WGS84.radii[1]);
  });

  it("converts surface normals back to cartographic coordinates", () => {
    const cartographic = Ellipsoid.WGS84.surfaceNormalToCartographic([0, 0, -1]);

    expect(cartographic.lon).toBeCloseTo(Math.PI / 2);
    expect(cartographic.lat).toBeCloseTo(0);
  });

  it("uses the standard geodetic form with the prime vertical radius", () => {
    const lat = (45 * Math.PI) / 180;
    const a = 6378137;
    const b = 6356752.314245179;
    const e2 = 1 - (b * b) / (a * a);
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const position = Ellipsoid.WGS84.cartographicToCartesian({ lon: 0, lat, height: 0 });

    expect(position[0]).toBeCloseTo(N * Math.cos(lat), 6);
    expect(position[1]).toBeCloseTo(N * (1 - e2) * sinLat, 6);
    expect(position[2]).toBeCloseTo(0, 6);
  });

  it("round-trips cartographic to cartesian and back within one millimetre", () => {
    const degreesToRadians = Math.PI / 180;
    const latitudes = [-89, -60, -30, 0, 30, 46.5, 60, 89];
    const longitudes = [-179, -90, 0, 11.35, 90, 179];
    const heights = [0, 500, 10_000, 1_000_000];

    for (const latDeg of latitudes) {
      for (const lonDeg of longitudes) {
        for (const height of heights) {
          const lon = lonDeg * degreesToRadians;
          const lat = latDeg * degreesToRadians;
          const position = Ellipsoid.WGS84.cartographicToCartesian({ lon, lat, height });
          const cartographic = Ellipsoid.WGS84.cartesianToCartographic(position);
          const roundTrip = Ellipsoid.WGS84.cartographicToCartesian(cartographic);

          for (let axis = 0; axis < 3; axis += 1) {
            expect(Math.abs(roundTrip[axis] - position[axis])).toBeLessThan(0.001);
          }

          expect(Math.abs((cartographic.height ?? 0) - height)).toBeLessThan(0.001);
        }
      }
    }
  });

  it("round-trips unit-scale positions used by the render coordinate system", () => {
    const lon = 11.35 * (Math.PI / 180);
    const lat = 46.5 * (Math.PI / 180);
    const position = Ellipsoid.WGS84.cartographicToCartesian({ lon, lat, height: 3000 });
    const unit = position.map((value) => value / Ellipsoid.WGS84.maximumRadius) as [number, number, number];
    const cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(unit);

    expect(cartographic.lon).toBeCloseTo(lon, 12);
    expect(cartographic.lat).toBeCloseTo(lat, 12);
    expect(cartographic.height ?? 0).toBeCloseTo(3000, 3);
  });
});
