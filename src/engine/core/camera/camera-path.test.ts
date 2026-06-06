import { describe, expect, it } from "vitest";
import { cameraPathDuration, sampleCameraPath, validateCameraPath, type CameraPath } from "./camera-path";

describe("CameraPath", () => {
  it("computes path duration from destination keyframes", () => {
    const path: CameraPath = {
      id: "demo",
      keyframes: [
        { lon: 0, lat: 0, height: 100 },
        { lon: 10, lat: 5, height: 200, duration: 2 },
        { lon: 20, lat: 10, height: 300, duration: 3 },
      ],
    };

    expect(cameraPathDuration(path)).toBe(5);
  });

  it("samples linearly when requested", () => {
    const sample = sampleCameraPath(
      {
        id: "linear",
        keyframes: [
          { lon: 0, lat: 0, height: 100 },
          { lon: 10, lat: 20, height: 300, duration: 4, easing: "linear" },
        ],
      },
      2,
    );

    expect(sample.lon).toBeCloseTo(5);
    expect(sample.lat).toBeCloseTo(10);
    expect(sample.height).toBeCloseTo(200);
    expect(sample.finished).toBe(false);
  });

  it("wraps longitude and heading through the shortest angular path", () => {
    const sample = sampleCameraPath(
      {
        id: "wrap",
        keyframes: [
          { lon: 170, lat: 0, height: 100, heading: 170 },
          { lon: -170, lat: 0, height: 100, heading: -170, duration: 2, easing: "linear" },
        ],
      },
      1,
    );

    expect(Math.abs(sample.lon)).toBeCloseTo(180);
    expect(Math.abs(sample.heading ?? 0)).toBeCloseTo(180);
  });

  it("loops elapsed time when requested", () => {
    const sample = sampleCameraPath(
      {
        id: "loop",
        loop: true,
        keyframes: [
          { lon: 0, lat: 0, height: 100 },
          { lon: 20, lat: 0, height: 100, duration: 2, easing: "linear" },
        ],
      },
      3,
    );

    expect(sample.lon).toBeCloseTo(10);
    expect(sample.finished).toBe(false);
  });

  it("rejects invalid path definitions", () => {
    expect(() => validateCameraPath({ id: "", keyframes: [{ lon: 0, lat: 0, height: 0 }] })).toThrow(
      "Invalid CameraPath id",
    );
    expect(() => validateCameraPath({ id: "empty", keyframes: [] })).toThrow(
      "CameraPath requires at least one keyframe",
    );
  });
});
