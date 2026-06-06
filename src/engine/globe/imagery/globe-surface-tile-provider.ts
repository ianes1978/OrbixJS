import { CameraTileSelector, type CameraTileSelectorContext, type CameraTileSelectorOptions } from "./tile-selector";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";

export type GlobeSurfaceTile = QuadtreeTile & {
  requestedId: string;
  state: "exact" | "fallback";
  targetLevel: number;
};

export type GlobeSurfaceTileSelection = {
  level: number;
  requestTiles: QuadtreeTile[];
  renderTiles: GlobeSurfaceTile[];
};

export type GlobeSurfaceTileProviderOptions = CameraTileSelectorOptions & {
  baseLevel?: number;
};

export class GlobeSurfaceTileProvider {
  private readonly selector: CameraTileSelector;
  private readonly baseLevel: number;

  constructor(private readonly options: GlobeSurfaceTileProviderOptions = {}) {
    this.selector = new CameraTileSelector(options);
    this.baseLevel = options.baseLevel ?? options.minLevel ?? 0;
  }

  select(
    lon: number,
    lat: number,
    cameraDistance: number,
    loaded: ReadonlySet<string>,
    context: CameraTileSelectorContext = {},
  ): GlobeSurfaceTileSelection {
    const selection = this.selector.select(lon, lat, cameraDistance, context);
    const resolved = new Map<string, GlobeSurfaceTile>();

    for (const tile of selection.tiles) {
      const renderTile = this.deepestLoadedTile(tile, loaded, selection.level);

      if (renderTile) {
        resolved.set(renderTile.id, renderTile);
      }
    }

    return {
      level: selection.level,
      requestTiles: selection.tiles,
      renderTiles: pruneDescendants([...resolved.values()]),
    };
  }

  private deepestLoadedTile(tile: QuadtreeTile, loaded: ReadonlySet<string>, targetLevel: number): GlobeSurfaceTile | undefined {
    let current = tile;

    while (current.z >= this.baseLevel) {
      if (loaded.has(current.id)) {
        return {
          ...current,
          requestedId: tile.id,
          state: current.id === tile.id ? "exact" : "fallback",
          targetLevel,
        };
      }

      if (current.z === 0) {
        return undefined;
      }

      current = parentTile(current);
    }

    return undefined;
  }
}

function pruneDescendants(tiles: GlobeSurfaceTile[]): GlobeSurfaceTile[] {
  const ids = new Set(tiles.map((tile) => tile.id));

  return tiles
    .filter((tile) => !hasAncestorInSet(tile, ids))
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

function hasAncestorInSet(tile: QuadtreeTile, ids: ReadonlySet<string>): boolean {
  let current = tile;

  while (current.z > 0) {
    current = parentTile(current);

    if (ids.has(current.id)) {
      return true;
    }
  }

  return false;
}

function parentTile(tile: QuadtreeTile): QuadtreeTile {
  return createQuadtreeTile(Math.floor(tile.x / 2), Math.floor(tile.y / 2), tile.z - 1);
}
