import { type TilesetTile } from "./tileset";

const WGS84_RADIUS_METERS = 6_378_137;

export type SelectedTilesetTile = {
  tile: TilesetTile;
  depth: number;
};

export function selectTilesetTile(
  root: TilesetTile,
  cameraDistance: number,
  options: {
    maxScreenSpaceError?: number;
  } = {},
): SelectedTilesetTile {
  const maxScreenSpaceError = options.maxScreenSpaceError ?? 0.035;
  return selectTile(root, cameraDistance, maxScreenSpaceError, 0);
}

function selectTile(
  tile: TilesetTile,
  cameraDistance: number,
  maxScreenSpaceError: number,
  depth: number,
): SelectedTilesetTile {
  if (tile.children.length === 0 || tileScreenSpaceError(tile, cameraDistance) <= maxScreenSpaceError) {
    return { tile, depth };
  }

  return selectTile(tile.children[0]!, cameraDistance, maxScreenSpaceError, depth + 1);
}

function tileScreenSpaceError(tile: TilesetTile, cameraDistance: number): number {
  const normalizedAltitude = Math.max(cameraDistance - 1, 0.001);
  return tile.geometricError / WGS84_RADIUS_METERS / normalizedAltitude;
}
