import { describe, expect, it } from "vitest";
import { dot, length } from "../math/vec3";
import { Ellipsoid } from "./ellipsoid";
import { createLocalFrameENU, localEnuToCartesian, localEnuToRenderUnit } from "./local-frame";

const epsilon = 1e-6;

describe("LocalFrame ENU", () => {
  it("creates east, north and up axes on the equator", () => {
    const frame = createLocalFrameENU({ lon: 0, lat: 0 });

    expect(frame.origin[0]).toBeCloseTo(Ellipsoid.WGS84.radii[0], 6);
    expect(frame.origin[1]).toBeCloseTo(0, 6);
    expect(frame.origin[2]).toBeCloseTo(0, 6);
    expect(frame.east[0]).toBeCloseTo(0, 6);
    expect(frame.east[1]).toBeCloseTo(0, 6);
    expect(frame.east[2]).toBeCloseTo(-1, 6);
    expect(frame.north[0]).toBeCloseTo(0, 6);
    expect(frame.north[1]).toBeCloseTo(1, 6);
    expect(frame.north[2]).toBeCloseTo(0, 6);
    expect(frame.up[0]).toBeCloseTo(1, 6);
    expect(frame.up[1]).toBeCloseTo(0, 6);
    expect(frame.up[2]).toBeCloseTo(0, 6);
  });

  it("converts local ENU meters into cartesian coordinates", () => {
    const frame = createLocalFrameENU({ lon: 0, lat: 0 });
    const cartesian = localEnuToCartesian(frame, [10, 20, 30]);

    expect(cartesian[0]).toBeCloseTo(Ellipsoid.WGS84.radii[0] + 30, 6);
    expect(cartesian[1]).toBeCloseTo(20, 6);
    expect(cartesian[2]).toBeCloseTo(-10, 6);
  });

  it("returns normalized render coordinates compatible with the globe renderer", () => {
    const frame = createLocalFrameENU({ lon: 0, lat: 0 });
    const renderPosition = localEnuToRenderUnit(frame, [0, 0, 0]);

    expect(renderPosition[0]).toBeCloseTo(1, 6);
    expect(renderPosition[1]).toBeCloseTo(0, 6);
    expect(renderPosition[2]).toBeCloseTo(0, 6);
  });

  it("keeps a stable orthonormal basis at the poles", () => {
    const frame = createLocalFrameENU({ lon: Math.PI / 4, lat: Math.PI / 2 });

    expect(length(frame.east)).toBeCloseTo(1, 6);
    expect(length(frame.north)).toBeCloseTo(1, 6);
    expect(length(frame.up)).toBeCloseTo(1, 6);
    expect(Math.abs(dot(frame.east, frame.north))).toBeLessThan(epsilon);
    expect(Math.abs(dot(frame.east, frame.up))).toBeLessThan(epsilon);
    expect(Math.abs(dot(frame.north, frame.up))).toBeLessThan(epsilon);
  });
});
