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
    const near = new OrbitCamera({ distance: 1.00002 });
    const mid = new OrbitCamera({ distance: 1.8 });
    const far = new OrbitCamera({ distance: 4 });

    expect(near.dragSensitivityScale()).toBeCloseTo(0.002);
    expect(mid.dragSensitivityScale()).toBeGreaterThan(near.dragSensitivityScale());
    expect(mid.dragSensitivityScale()).toBeGreaterThan(0.18);
    expect(mid.dragSensitivityScale()).toBeLessThan(0.26);
    expect(far.dragSensitivityScale()).toBe(1);
  });

  it("rotates the camera and target by a grabbed surface point", () => {
    const camera = new OrbitCamera({ target: [0.2, 0, 0], distance: 3.2, yaw: 0, pitch: 0 });
    const beforeDistance = camera.distance;

    camera.rotateSurfacePointTo([1, 0, 0], [0, 0, 1]);

    expect(camera.distance).toBeCloseTo(beforeDistance);
    expect(camera.target[0]).toBeCloseTo(0);
    expect(camera.target[1]).toBeCloseTo(0);
    expect(camera.target[2]).toBeCloseTo(0.2);
  });

  it("moves the camera so a grabbed world point stays under the cursor ray", () => {
    const camera = new OrbitCamera({ target: [0, 0, 0], distance: 3.2, yaw: 0, pitch: 0 });

    const moved = camera.moveGrabbedPointToRay([0, 0, 0], {
      origin: [0.15, 0, 3.1],
      direction: [0, 0, -1],
    });

    expect(moved).toBe(true);
    expect(camera.target[0]).toBeCloseTo(-0.15);
    expect(camera.target[1]).toBeCloseTo(0);
    expect(camera.distance).toBeCloseTo(3.2);
  });

  it("can damp grabbed point corrections for smoother drag", () => {
    const camera = new OrbitCamera({ target: [0, 0, 0], distance: 3.2, yaw: 0, pitch: 0 });

    camera.moveGrabbedPointToRay(
      [0, 0, 0],
      {
        origin: [0.15, 0, 3.1],
        direction: [0, 0, -1],
      },
      { strength: 0.5, maxStep: 0.04 },
    );

    expect(camera.target[0]).toBeCloseTo(-0.04);
    expect(camera.distance).toBeCloseTo(3.2);
  });

  it("scales zoom steps from the altitude above the surface", () => {
    const near = new OrbitCamera({ distance: 1.0002 });
    const far = new OrbitCamera({ distance: 3.2 });

    near.zoom(-0.1);
    far.zoom(-0.1);

    expect(1.0002 - near.distance).toBeLessThan(0.00002);
    expect(3.2 - far.distance).toBeGreaterThan(0.2);
  });

  it("keeps the camera above the globe when zooming with a panned target", () => {
    const camera = new OrbitCamera({ target: [0.8, 0, 0], distance: 1.2, yaw: Math.PI, pitch: 0 });

    camera.zoom(-10);

    expect(camera.geocentricDistance).toBeCloseTo(1.00002);
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

  it("reduces pan movement near the globe surface", () => {
    const near = new OrbitCamera({ distance: 1.01, yaw: 0, pitch: 0 });
    const far = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });

    near.pan(100, 0);
    far.pan(100, 0);

    expect(near.target[0]).toBeGreaterThan(0);
    expect(far.target[0]).toBeGreaterThan(near.target[0] * 30_000);
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
