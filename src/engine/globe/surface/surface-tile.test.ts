import { describe, expect, it } from "vitest";
import { createQuadtreeTile } from "../imagery/quadtree-tile";
import { createFlatTerrainTile } from "../terrain/terrain-provider";
import { createTerrainMesh } from "../terrain/terrain-mesh";
import { createSurfaceTileSet, ellipsoidSurfaceTileIds, terrainSurfaceMeshes } from "./surface-tile";

describe("surface-tile", () => {
  it("uses terrain mesh as the active surface when terrain is ready", () => {
    const tile = createQuadtreeTile(2, 1, 3);
    const terrainTile = { level: tile.z, x: tile.x, y: tile.y };
    const heightmap = createFlatTerrainTile(terrainTile, { size: 2, height: 120 });
    const terrainMesh = {
      id: tile.id,
      tile: terrainTile,
      heightmap,
      exaggeration: 1,
      skirtDepth: 0,
      mesh: createTerrainMesh(heightmap),
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
    expect(surfaceTiles[0].boundingSphere.center).toHaveLength(3);
    expect(surfaceTiles[0].boundingSphere.radius).toBeGreaterThan(0);
    expect(surfaceTiles[0].boundingSphere.radius).toBeLessThan(1.5);
  });

  it("uses terrain mesh positions for ready surface bounding volumes", () => {
    const tile = createQuadtreeTile(1, 1, 2);
    const terrainTile = { level: tile.z, x: tile.x, y: tile.y };
    const heightmap = createFlatTerrainTile(terrainTile, { size: 3, height: 2500 });
    const terrainMesh = {
      id: tile.id,
      tile: terrainTile,
      heightmap,
      exaggeration: 1,
      skirtDepth: 25,
      mesh: createTerrainMesh(heightmap, { skirtDepth: 25 }),
    };
    const [surfaceTile] = createSurfaceTileSet({
      imageryTiles: [tile],
      terrainMeshes: [terrainMesh],
    });
    const xs = terrainMesh.mesh.positions.filter((_, index) => index % 3 === 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    expect(surfaceTile.activeMesh).toBe("terrain");
    expect(surfaceTile.hasSkirt).toBe(true);
    expect(surfaceTile.boundingSphere.center[0]).toBeGreaterThanOrEqual(minX);
    expect(surfaceTile.boundingSphere.center[0]).toBeLessThanOrEqual(maxX);
    expect(surfaceTile.boundingSphere.radius).toBeGreaterThan(0);
  });

  it("marks GPU-displaced terrain as skirted when the runtime provides skirt depth", () => {
    const tile = createQuadtreeTile(1, 1, 2);
    const terrainTile = { level: tile.z, x: tile.x, y: tile.y };
    const heightmap = createFlatTerrainTile(terrainTile, { size: 3, height: 2500 });
    const [surfaceTile] = createSurfaceTileSet({
      imageryTiles: [tile],
      terrainMeshes: [
        {
          id: tile.id,
          tile: terrainTile,
          heightmap,
          exaggeration: 1,
          skirtDepth: 40,
        },
      ],
    });

    expect(surfaceTile.activeMesh).toBe("terrain");
    expect(surfaceTile.hasSkirt).toBe(true);
  });
});
