import { describe, expect, it } from "vitest";
import { OrbitCamera } from "../../core/camera/orbit-camera";
import { multiply } from "../../core/math/mat4";
import { traverseQuadtree, type QuadtreeTraversalResult } from "./quadtree-traversal";

const viewportWidth = 1280;
const viewportHeight = 800;

function traversalAt(options: {
  height: number;
  pitch?: number;
  maxLevel?: number;
  maxTiles?: number;
  thresholdPixels?: number;
}): QuadtreeTraversalResult {
  // minDistance basso: nell'app è GeoViewer ad adattarlo all'ellissoide; il
  // default (sfera equatoriale) clamperebbe le quote basse a ~11 km.
  const camera = new OrbitCamera({ minDistance: 0.99 });
  camera.flyTo({ lon: 11.35, lat: 46.5, height: options.height, pitch: options.pitch });

  return traverseQuadtree({
    cameraPositionUnit: camera.position,
    viewProjection: multiply(camera.projectionMatrix(viewportWidth / viewportHeight), camera.viewMatrix()),
    viewportHeightPx: viewportHeight,
    fovY: camera.fov,
    thresholdPixels: options.thresholdPixels ?? 294,
    maxLevel: options.maxLevel ?? 18,
    maxTiles: options.maxTiles ?? 192,
  });
}

function levelHistogram(result: QuadtreeTraversalResult): Record<number, number> {
  const histogram: Record<number, number> = {};

  for (const selected of result.tiles) {
    histogram[selected.tile.z] = (histogram[selected.tile.z] ?? 0) + 1;
  }

  return histogram;
}

describe("traverseQuadtree", () => {
  it("covers the globe view with coarse levels and no excess tiles", () => {
    const result = traversalAt({ height: 1_500_000 });
    const levels = result.tiles.map((selected) => selected.tile.z);

    expect(result.tiles.length).toBeGreaterThan(16);
    expect(result.tiles.length).toBeLessThanOrEqual(192);
    expect(Math.max(...levels)).toBeLessThanOrEqual(9);
    expect(Math.min(...levels)).toBeGreaterThanOrEqual(2);
  });

  it("reaches deep levels under the camera at low nadir altitude", () => {
    const result = traversalAt({ height: 3_000 });
    const maxLevel = Math.max(...result.tiles.map((selected) => selected.tile.z));

    expect(maxLevel).toBeGreaterThanOrEqual(15);
  });

  it("does not waste budget on giant coarse leaves at low altitude", () => {
    const result = traversalAt({ height: 3_000 });
    const histogram = levelHistogram(result);
    const coarseLeaves = Object.entries(histogram)
      .filter(([level]) => Number(level) <= 4)
      .reduce((total, [, count]) => total + count, 0);

    expect(coarseLeaves).toBe(0);
  });

  it("produces a monotonic level falloff with distance", () => {
    const result = traversalAt({ height: 6_000, pitch: 1.1 });
    const byDistance = [...result.tiles].sort((a, b) => a.distanceMeters - b.distanceMeters);
    const nearLevel = average(byDistance.slice(0, 8).map((selected) => selected.tile.z));
    const farLevel = average(byDistance.slice(-8).map((selected) => selected.tile.z));

    expect(nearLevel).toBeGreaterThan(farLevel + 2);
  });

  it("keeps full coverage when the budget is small", () => {
    const generous = traversalAt({ height: 6_000, pitch: 1.1, maxTiles: 256 });
    const tight = traversalAt({ height: 6_000, pitch: 1.1, maxTiles: 48 });

    // Stessa porzione di mondo coperta: ogni foglia "generosa" deve essere
    // contenuta in (o uguale a) una foglia della selezione stretta.
    for (const selected of generous.tiles) {
      const covered = tight.tiles.some((leaf) => containsOrEquals(leaf.tile, selected.tile));

      expect(covered, `tile ${selected.tile.id} non coperto dalla selezione a budget stretto`).toBe(true);
    }
  });

  it("is deterministic for identical inputs", () => {
    const first = traversalAt({ height: 6_000, pitch: 1.1 });
    const second = traversalAt({ height: 6_000, pitch: 1.1 });

    expect(first.tiles.map((selected) => selected.tile.id)).toEqual(second.tiles.map((selected) => selected.tile.id));
  });

  it("respects maxLevel", () => {
    const result = traversalAt({ height: 300, maxLevel: 14 });
    const maxLevel = Math.max(...result.tiles.map((selected) => selected.tile.z));

    expect(maxLevel).toBeLessThanOrEqual(14);
  });
});

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function containsOrEquals(ancestor: { x: number; y: number; z: number }, tile: { x: number; y: number; z: number }): boolean {
  if (tile.z < ancestor.z) {
    return false;
  }

  const factor = 2 ** (tile.z - ancestor.z);

  return Math.floor(tile.x / factor) === ancestor.x && Math.floor(tile.y / factor) === ancestor.y;
}
