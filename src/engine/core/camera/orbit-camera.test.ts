import { describe, expect, it } from "vitest";
import { Ellipsoid } from "../geodesy/ellipsoid";
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

  it("keeps zoom above a raised terrain surface", () => {
    const terrainHeight = 5000;
    const terrainRadius = 1 + terrainHeight / 6_378_137;
    const camera = new OrbitCamera({ distance: 1.002, minDistance: 1 });

    camera.zoom(-100, terrainHeight);

    expect(camera.distance).toBeCloseTo(terrainRadius);
    expect(camera.geocentricDistance).toBeGreaterThanOrEqual(terrainRadius);
  });

  it("keeps a physical wheel step near the terrain", () => {
    const camera = new OrbitCamera({ distance: 1 + 2 / 6_378_137, minDistance: 1 });

    camera.zoom(-0.1);

    expect((camera.distance - 1) * 6_378_137).toBeCloseTo(1.5);
  });

  it("keeps the camera above the globe when zooming with a panned target", () => {
    const camera = new OrbitCamera({ target: [0.8, 0, 0], distance: 1.2, yaw: Math.PI, pitch: 0 });

    camera.zoom(-10);

    expect(camera.geocentricDistance).toBeCloseTo(1.00002);
  });

  it("flies to cartographic coordinates expressed in degrees", () => {
    const camera = new OrbitCamera();

    camera.flyTo({ lon: 0, lat: 45, height: 1_000_000 });

    const expectedPosition = Ellipsoid.WGS84.cartographicToCartesian({
      lon: 0,
      lat: Math.PI / 4,
      height: 1_000_000,
    });
    const expectedDistance =
      Math.hypot(...expectedPosition) / Ellipsoid.WGS84.maximumRadius;

    expect(camera.yaw).toBeCloseTo(Math.PI / 2);
    expect(camera.pitch).toBeCloseTo(Math.PI / 4);
    expect(camera.distance).toBeCloseTo(expectedDistance);
  });

  it("keeps low-altitude flyTo close to the local WGS84 ellipsoid instead of the maximum radius sphere", () => {
    const camera = new OrbitCamera();
    const lon = 11.35 * (Math.PI / 180);
    const lat = 46.5 * (Math.PI / 180);
    const height = 150;

    camera.flyTo({ lon: 11.35, lat: 46.5, height });

    const expectedPosition = Ellipsoid.WGS84.cartographicToCartesian({ lon, lat, height });
    const expectedDistance =
      Math.hypot(...expectedPosition) / Ellipsoid.WGS84.maximumRadius;
    const oldSphericalDistance = 1 + height / Ellipsoid.WGS84.maximumRadius;

    expect(camera.distance).toBeCloseTo(expectedDistance);
    expect(Math.abs(camera.distance - oldSphericalDistance)).toBeGreaterThan(0.000001);
  });

  it("exports an independent camera snapshot", () => {
    const camera = new OrbitCamera({ target: [0.1, 0.2, 0.3], distance: 2.4, yaw: 0.7, pitch: -0.2 });

    camera.tilt(0.3);
    camera.look(0.2, 0);
    const snapshot = camera.snapshot();
    camera.target[0] = 0.9;

    expect(snapshot.target).toEqual([0.1, 0.2, 0.3]);
    expect(snapshot.position).toHaveLength(3);
    expect(snapshot.distance).toBe(2.4);
    expect(snapshot.yaw).toBe(0.7);
    expect(snapshot.pitch).toBe(-0.2);
    expect(snapshot.tiltOffset).toBe(0.3);
    expect(snapshot.lookYawOffset).toBeCloseTo(0.2);
    expect(snapshot.minTilt).toBeCloseTo(-Math.PI * 2);
    expect(snapshot.maxTilt).toBeCloseTo(Math.PI * 2);
  });

  it("restores a camera snapshot", () => {
    const camera = new OrbitCamera({ target: [0.1, 0.2, 0.3], distance: 2.4, yaw: 0.7, pitch: -0.2 });

    camera.tilt(0.3);
    camera.look(0.2, 0);
    const snapshot = camera.snapshot();
    camera.flyTo({ lon: 139.7, lat: 35.7, height: 1_200_000 });
    camera.restoreSnapshot(snapshot);

    expect(camera.target).toEqual([0.1, 0.2, 0.3]);
    expect(camera.distance).toBeCloseTo(2.4);
    expect(camera.yaw).toBeCloseTo(0.7);
    expect(camera.pitch).toBeCloseTo(-0.2);
    expect(camera.tiltOffset).toBeCloseTo(0.3);
    expect(camera.lookYawOffset).toBeCloseTo(0.2);
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

  it("looks left and right without moving the orbit camera", () => {
    const camera = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });
    const beforeView = camera.viewMatrix();
    const beforePosition = camera.position;

    camera.look(0.4, 0);

    expect(camera.lookYawOffset).toBeCloseTo(0.4);
    expect(camera.position).toEqual(beforePosition);
    expect(camera.target).toEqual([0, 0, 0]);
    expect(camera.viewMatrix()).not.toEqual(beforeView);
  });

  it("applies horizontal look around the tilted local up axis", () => {
    const camera = new OrbitCamera({ distance: 3.2, yaw: 0, pitch: 0 });

    camera.tilt(0.8);
    const beforeLook = camera.viewMatrix();
    camera.look(0.4, 0);
    const afterLook = camera.viewMatrix();

    expect([afterLook[1], afterLook[5], afterLook[9]]).toEqual([
      expect.closeTo(beforeLook[1]),
      expect.closeTo(beforeLook[5]),
      expect.closeTo(beforeLook[9]),
    ]);
    expect([afterLook[2], afterLook[6], afterLook[10]]).not.toEqual([beforeLook[2], beforeLook[6], beforeLook[10]]);
    expect(camera.position).toEqual([0, 0, 3.2]);
    expect(camera.target).toEqual([0, 0, 0]);
  });

  it("keeps a valid view matrix when tilting toward the sky", () => {
    const camera = new OrbitCamera({ distance: 1.05, yaw: 0, pitch: 0 });

    camera.tilt(Math.PI / 2);

    expect([...camera.viewMatrix()].every(Number.isFinite)).toBe(true);
    expect(camera.target).toEqual([0, 0, 0]);
  });

  it("clamps and resets tilt", () => {
    const camera = new OrbitCamera();

    camera.tilt(10);
    expect(camera.tiltOffset).toBe(Math.PI * 2);

    camera.look(0.4, 0);
    camera.flyTo({ lon: 12.5, lat: 42.5 });
    expect(camera.tiltOffset).toBe(0);
    expect(camera.lookYawOffset).toBe(0);
  });

  it("applies camera limits at runtime", () => {
    const camera = new OrbitCamera({ distance: 3.2 });

    camera.setLimits({
      minDistance: 2,
      maxDistance: 3,
      minTilt: -0.5,
      maxTilt: 0.5,
      fov: (70 * Math.PI) / 180,
    });
    camera.tilt(10);
    camera.zoom(-100);

    expect(camera.minDistance).toBe(2);
    expect(camera.maxDistance).toBe(3);
    expect(camera.distance).toBeGreaterThanOrEqual(2);
    expect(camera.tiltOffset).toBe(0.5);
    expect(camera.fov).toBeCloseTo((70 * Math.PI) / 180);
  });

  it("allows the minimum camera distance to reach the ellipsoid surface", () => {
    const camera = new OrbitCamera({ distance: 1.2, minDistance: 1, yaw: 0, pitch: 0 });

    camera.zoom(-100);

    expect(camera.distance).toBeCloseTo(1);
    expect(camera.geocentricDistance).toBeCloseTo(1);
  });

  it("allows runtime minimum distance below the unit sphere for WGS84 ellipsoid navigation", () => {
    const camera = new OrbitCamera({ distance: 1.2, minDistance: 1 });

    camera.setLimits({ minDistance: 0.998 });
    camera.zoom(-100, 0, 0.998);

    expect(camera.minDistance).toBeCloseTo(0.998);
    expect(camera.distance).toBeCloseTo(0.998);
  });
});
