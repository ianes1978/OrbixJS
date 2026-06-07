import { type QuadtreeTile } from "../imagery/quadtree-tile";
import { type RectangleRadians, WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type TerrainSurfaceMeshEntry } from "../terrain/terrain-surface-runtime";

export type SurfaceTerrainState = "none" | "loading" | "ready" | "error";

export type SurfaceActiveMesh = "ellipsoid" | "terrain";

export type SurfaceTile = {
  id: string;
  tile: QuadtreeTile;
  bounds: RectangleRadians;
  level: number;
  terrainState: SurfaceTerrainState;
  activeMesh: SurfaceActiveMesh;
  terrainMesh?: TerrainSurfaceMeshEntry;
  // Placeholder for tile-local bounding volumes and skirts. Keeping it explicit
  // prevents the terrain pipeline from becoming an opaque overlay again.
  hasSkirt: boolean;
};

export type SurfaceTileSetOptions = {
  imageryTiles: readonly QuadtreeTile[];
  terrainMeshes?: readonly TerrainSurfaceMeshEntry[];
  loadingTerrainIds?: readonly string[] | ReadonlySet<string>;
  errorTerrainIds?: readonly string[] | ReadonlySet<string>;
  tiling?: WebMercatorTilingScheme;
};

export function createSurfaceTileSet({
  imageryTiles,
  terrainMeshes = [],
  loadingTerrainIds = [],
  errorTerrainIds = [],
  tiling = new WebMercatorTilingScheme(),
}: SurfaceTileSetOptions): SurfaceTile[] {
  const terrainById = new Map(terrainMeshes.map((entry) => [entry.id, entry]));
  const loading = toReadonlySet(loadingTerrainIds);
  const errors = toReadonlySet(errorTerrainIds);

  return imageryTiles.map((tile) => {
    const terrainMesh = terrainById.get(tile.id);
    const terrainState = terrainMesh
      ? "ready"
      : errors.has(tile.id)
        ? "error"
        : loading.has(tile.id)
          ? "loading"
          : "none";

    return {
      id: tile.id,
      tile,
      bounds: tiling.tileXYToRectangle(tile),
      level: tile.z,
      terrainState,
      activeMesh: terrainState === "ready" ? "terrain" : "ellipsoid",
      terrainMesh,
      hasSkirt: false,
    };
  });
}

export function ellipsoidSurfaceTileIds(surfaceTiles: readonly SurfaceTile[]): string[] {
  return surfaceTiles.filter((tile) => tile.activeMesh === "ellipsoid").map((tile) => tile.id);
}

export function terrainSurfaceMeshes(surfaceTiles: readonly SurfaceTile[]): TerrainSurfaceMeshEntry[] {
  return surfaceTiles
    .filter((tile): tile is SurfaceTile & { terrainMesh: TerrainSurfaceMeshEntry } => tile.activeMesh === "terrain" && Boolean(tile.terrainMesh))
    .map((tile) => tile.terrainMesh);
}

function toReadonlySet(values: readonly string[] | ReadonlySet<string>): ReadonlySet<string> {
  return values instanceof Set ? values : new Set(values);
}
