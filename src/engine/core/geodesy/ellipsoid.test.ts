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
    const northPole = Ellipsoid.WGS84.cartographicToCartesian({ lon: 0, lat: Math.PI / 2 });

    expect(equator[0]).toBeCloseTo(Ellipsoid.WGS84.radii[0]);
    expect(equator[1]).toBeCloseTo(0);
    expect(equator[2]).toBeCloseTo(0);
    expect(northPole[1]).toBeCloseTo(Ellipsoid.WGS84.radii[1]);
  });
});
