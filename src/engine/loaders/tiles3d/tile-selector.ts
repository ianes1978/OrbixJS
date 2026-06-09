import { type TilesetTile } from "./tileset";
import { computeScreenSpaceError, shouldRefineByScreenSpaceError } from "../../core/lod/screen-space-error";
import { dot, normalize, subtract, type Vec3 } from "../../core/math/vec3";

const WGS84_RADIUS_METERS = 6_378_137;
const defaultViewportHeight = 900;
const defaultFov = Math.PI / 4;

export type SelectedTilesetTile = {
  tile: TilesetTile;
  depth: number;
};

export function selectTilesetTile(
  root: TilesetTile,
  cameraDistance: number,
  options: {
    cameraPosition?: Vec3;
    cameraTarget?: Vec3;
    maxScreenSpaceError?: number;
    viewportHeight?: number;
    fov?: number;
  } = {},
): SelectedTilesetTile | undefined {
  const maxScreenSpaceError = options.maxScreenSpaceError ?? 16;
  if (!isTileInFrontOfCamera(root, options.cameraPosition, options.cameraTarget)) {
    return undefined;
  }

  return selectTile(
    root,
    cameraDistance,
    {
      maxScreenSpaceError,
      viewportHeight: options.viewportHeight ?? defaultViewportHeight,
      fov: options.fov ?? defaultFov,
    },
    0,
  );
}

function selectTile(
  tile: TilesetTile,
  cameraDistance: number,
  options: {
    maxScreenSpaceError: number;
    viewportHeight: number;
    fov: number;
  },
  depth: number,
): SelectedTilesetTile {
  if (
    tile.children.length === 0 ||
    !shouldRefineByScreenSpaceError(tileScreenSpaceError(tile, cameraDistance, options), options.maxScreenSpaceError)
  ) {
    return { tile, depth };
  }

  return selectTile(tile.children[0]!, cameraDistance, options, depth + 1);
}

function tileScreenSpaceError(
  tile: TilesetTile,
  cameraDistance: number,
  options: {
    viewportHeight: number;
    fov: number;
  },
): number {
  const distanceMeters = Math.max(cameraDistance - 1, 0) * WGS84_RADIUS_METERS;

  return computeScreenSpaceError({
    geometricErrorMeters: tile.geometricError,
    distanceMeters,
    viewportHeight: options.viewportHeight,
    fov: options.fov,
  });
}

function isTileInFrontOfCamera(tile: TilesetTile, cameraPosition: Vec3 | undefined, cameraTarget: Vec3 | undefined): boolean {
  if (!cameraPosition || !cameraTarget || tile.boundingVolume.type !== "region") {
    return true;
  }

  const center = regionCenterToUnitSphere(tile.boundingVolume.values);
  const forward = normalize(subtract(cameraTarget, cameraPosition));
  const toCenter = normalize(subtract(center, cameraPosition));
  const cameraSurfaceNormal = normalize(cameraPosition);

  return dot(forward, toCenter) > -0.08 && dot(cameraSurfaceNormal, center) > -0.25;
}

function regionCenterToUnitSphere(region: [number, number, number, number, number, number]): Vec3 {
  const [west, south, east, north] = region;
  const lon = (west + east) * 0.5;
  const lat = (south + north) * 0.5;
  const cosLat = Math.cos(lat);

  return [cosLat * Math.cos(lon), Math.sin(lat), -cosLat * Math.sin(lon)];
}
