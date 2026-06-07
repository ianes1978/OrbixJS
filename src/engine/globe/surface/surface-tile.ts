import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { distance, type MutableVec3, type Vec3 } from "../../core/math/vec3";
import { type QuadtreeTile } from "../imagery/quadtree-tile";
import { type RectangleRadians, WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type TerrainSurfaceMeshEntry } from "../terrain/terrain-surface-runtime";

export type SurfaceTerrainState = "none" | "loading" | "ready" | "error";

export type SurfaceActiveMesh = "ellipsoid" | "terrain";

export type SurfaceBoundingSphere = {
  center: MutableVec3;
  radius: number;
};

export type SurfaceTile = {
  id: string;
  tile: QuadtreeTile;
  bounds: RectangleRadians;
  level: number;
  terrainState: SurfaceTerrainState;
  activeMesh: SurfaceActiveMesh;
  boundingSphere: SurfaceBoundingSphere;
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
  ellipsoid?: Ellipsoid;
};

export function createSurfaceTileSet({
  imageryTiles,
  terrainMeshes = [],
  loadingTerrainIds = [],
  errorTerrainIds = [],
  tiling = new WebMercatorTilingScheme(),
  ellipsoid = Ellipsoid.WGS84,
}: SurfaceTileSetOptions): SurfaceTile[] {
  const terrainById = new Map(terrainMeshes.map((entry) => [entry.id, entry]));
  const loading = toReadonlySet(loadingTerrainIds);
  const errors = toReadonlySet(errorTerrainIds);

  return imageryTiles.map((tile) => {
    const terrainMesh = terrainById.get(tile.id);
    const bounds = tiling.tileXYToRectangle(tile);
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
      bounds,
      level: tile.z,
      terrainState,
      activeMesh: terrainState === "ready" ? "terrain" : "ellipsoid",
      boundingSphere: terrainMesh ? boundingSphereFromPositions(terrainMesh.mesh.positions) : boundingSphereFromBounds(bounds, ellipsoid),
      terrainMesh,
      hasSkirt: terrainMesh?.mesh.hasSkirt ?? false,
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

function boundingSphereFromPositions(positions: Float32Array): SurfaceBoundingSphere {
  if (positions.length < 3) {
    return { center: [0, 0, 0], radius: 0 };
  }

  const center: MutableVec3 = [0, 0, 0];
  const vertexCount = positions.length / 3;

  for (let index = 0; index < positions.length; index += 3) {
    center[0] += positions[index];
    center[1] += positions[index + 1];
    center[2] += positions[index + 2];
  }

  center[0] /= vertexCount;
  center[1] /= vertexCount;
  center[2] /= vertexCount;

  return {
    center,
    radius: maxDistanceToCenter(center, positions),
  };
}

function boundingSphereFromBounds(bounds: RectangleRadians, ellipsoid: Ellipsoid): SurfaceBoundingSphere {
  const centerLon = (bounds.west + bounds.east) * 0.5;
  const centerLat = (bounds.south + bounds.north) * 0.5;
  const center = normalizedCartographic(ellipsoid, centerLon, centerLat);
  const samples = [
    normalizedCartographic(ellipsoid, bounds.west, bounds.south),
    normalizedCartographic(ellipsoid, bounds.east, bounds.south),
    normalizedCartographic(ellipsoid, bounds.west, bounds.north),
    normalizedCartographic(ellipsoid, bounds.east, bounds.north),
    normalizedCartographic(ellipsoid, centerLon, bounds.south),
    normalizedCartographic(ellipsoid, centerLon, bounds.north),
    normalizedCartographic(ellipsoid, bounds.west, centerLat),
    normalizedCartographic(ellipsoid, bounds.east, centerLat),
  ];

  return {
    center,
    radius: samples.reduce((radius, sample) => Math.max(radius, distance(center, sample)), 0),
  };
}

function normalizedCartographic(ellipsoid: Ellipsoid, lon: number, lat: number): MutableVec3 {
  const position = ellipsoid.cartographicToCartesian({ lon, lat });

  return [
    position[0] / ellipsoid.maximumRadius,
    position[1] / ellipsoid.maximumRadius,
    position[2] / ellipsoid.maximumRadius,
  ];
}

function maxDistanceToCenter(center: Vec3, positions: Float32Array): number {
  let radius = 0;

  for (let index = 0; index < positions.length; index += 3) {
    radius = Math.max(radius, distance(center, [positions[index], positions[index + 1], positions[index + 2]]));
  }

  return radius;
}
