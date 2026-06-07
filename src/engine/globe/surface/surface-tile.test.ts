import { describe, expect, it } from "vitest";
import { createQuadtreeTile } from "../imagery/quadtree-tile";
import { createFlatTerrainTile } from "../terrain/terrain-provider";
import { createTerrainMesh } from "../terrain/terrain-mesh";
import { createSurfaceTileSet, ellipsoidSurfaceTileIds, terrainSurfaceMeshes } from "./surface-tile";

describe("surface-tile", () => {
  it("uses terrain mesh as the active surface when terrain is ready", () => {
    const tile = createQuadtreeTile(2, 1, 3);
    const terrainTile = { level: tile.z, x: tile.x, y: tile.y };
    const terrainMesh = {
      id: tile.id,
      tile: terrainTile,
      mesh: createTerrainMesh(createFlatTerrainTile(terrainTile, { size: 2, height: 120 })),
    };
    const surfaceTiles = createSurfaceTileSet({
      imageryTiles: [tile],
      terrainMeshes: [terrainMesh],
      loadingTerrainIds: [tile.id],
    });

    expect(surfaceTiles).toHaveLength(1);
    expect(surfaceTiles[0]).toMatchObject({
      id: "3/2/1",
      level: 3,
      terrainState: "ready",
      activeMesh: "terrain",
      hasSkirt: false,
    });
    expect(surfaceTiles[0].terrainMesh).toBe(terrainMesh);
    expect(terrainSurfaceMeshes(surfaceTiles)).toEqual([terrainMesh]);
    expect(ellipsoidSurfaceTileIds(surfaceTiles)).toEqual([]);
  });

  it("keeps ellipsoid fallback active while terrain is loading or unavailable", () => {
    const loading = createQuadtreeTile(0, 0, 2);
    const unavailable = createQuadtreeTile(1, 0, 2);
    const failed = createQuadtreeTile(2, 0, 2);
    const surfaceTiles = createSurfaceTileSet({
      imageryTiles: [loading, unavailable, failed],
      loadingTerrainIds: [loading.id],
      errorTerrainIds: [failed.id],
    });

    expect(surfaceTiles.map((tile) => tile.terrainState)).toEqual(["loading", "none", "error"]);
    expect(surfaceTiles.every((tile) => tile.activeMesh === "ellipsoid")).toBe(true);
    expect(ellipsoidSurfaceTileIds(surfaceTiles)).toEqual([loading.id, unavailable.id, failed.id]);
    expect(terrainSurfaceMeshes(surfaceTiles)).toEqual([]);
  });

  it("stores geographic bounds for culling and future bounding volumes", () => {
    const surfaceTiles = createSurfaceTileSet({ imageryTiles: [createQuadtreeTile(1, 1, 1)] });

    expect(surfaceTiles[0].bounds.west).toBeCloseTo(0);
    expect(surfaceTiles[0].bounds.east).toBeCloseTo(Math.PI);
    expect(surfaceTiles[0].bounds.south).toBeCloseTo(-1.484422, 5);
    expect(surfaceTiles[0].bounds.north).toBeCloseTo(0);
  });
});
