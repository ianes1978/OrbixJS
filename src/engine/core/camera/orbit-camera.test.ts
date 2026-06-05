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
});
