import { describe, expect, it } from "vitest";
import { OrbitCamera } from "./orbit-camera";

describe("OrbitCamera", () => {
  it("clamps pitch and zoom distance", () => {
    const camera = new OrbitCamera({ distance: 3, minDistance: 2, maxDistance: 4 });

    camera.orbit(0, 100);
    camera.zoom(-100);

    expect(camera.pitch).toBeLessThanOrEqual(1.42);
    expect(camera.distance).toBe(2);

    camera.zoom(100);
    expect(camera.distance).toBe(4);
  });

  it("returns view and projection matrices", () => {
    const camera = new OrbitCamera();

    expect(camera.position).toHaveLength(3);
    expect(camera.viewMatrix()).toHaveLength(16);
    expect(camera.projectionMatrix(16 / 9)).toHaveLength(16);
  });

  it("reduces drag sensitivity near the globe surface", () => {
    const near = new OrbitCamera({ distance: 1.08 });
    const mid = new OrbitCamera({ distance: 1.8 });
    const far = new OrbitCamera({ distance: 4 });

    expect(near.dragSensitivityScale()).toBeCloseTo(0.04);
    expect(mid.dragSensitivityScale()).toBeGreaterThan(near.dragSensitivityScale());
    expect(far.dragSensitivityScale()).toBe(1);
  });

  it("flies to cartographic coordinates expressed in degrees", () => {
    const camera = new OrbitCamera();

    camera.flyTo({ lon: 0, lat: 45, height: 1_000_000 });

    expect(camera.yaw).toBeCloseTo(Math.PI / 2);
    expect(camera.pitch).toBeCloseTo(Math.PI / 4);
    expect(camera.distance).toBeCloseTo(1 + 1_000_000 / 6_378_137);
  });

  it("pans the camera target in the view plane", () => {
    const camera = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });

    camera.pan(100, 0);

    expect(camera.target[0]).toBeGreaterThan(0);
    expect(camera.target[1]).toBeCloseTo(0);
    expect(camera.target[2]).toBeCloseTo(0);
  });

  it("keeps pan target near the globe", () => {
    const camera = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });

    camera.pan(10000, 10000);

    expect(Math.hypot(...camera.target)).toBeCloseTo(0.85);
  });

  it("tilts the camera view without moving the orbit target", () => {
    const camera = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });
    const before = camera.viewMatrix();

    camera.tilt(0.4);

    expect(camera.tiltOffset).toBeCloseTo(0.4);
    expect(camera.target).toEqual([0, 0, 0]);
    expect(camera.viewMatrix()).not.toEqual(before);
  });

  it("clamps and resets tilt", () => {
    const camera = new OrbitCamera();

    camera.tilt(10);
    expect(camera.tiltOffset).toBe(1.4);

    camera.flyTo({ lon: 12.5, lat: 42.5 });
    expect(camera.tiltOffset).toBe(0);
  });
});
