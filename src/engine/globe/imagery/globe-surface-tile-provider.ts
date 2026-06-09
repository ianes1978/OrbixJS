import { CameraTileSelector, type CameraTileSelectorContext, type CameraTileSelectorOptions } from "./tile-selector";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";

export type GlobeSurfaceTile = QuadtreeTile & {
  requestedId: string;
  sourceTile: QuadtreeTile;
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
    contextOrUnavailable: CameraTileSelectorContext | ReadonlySet<string> = {},
    context: CameraTileSelectorContext = {},
  ): GlobeSurfaceTileSelection {
    const unavailable = isReadonlySet(contextOrUnavailable) ? contextOrUnavailable : new Set<string>();
    const selectionContext = isReadonlySet(contextOrUnavailable) ? context : contextOrUnavailable;
    const selection = this.selector.select(lon, lat, cameraDistance, selectionContext);
    const requestTiles = normalizeUnavailableRequests(selection.tiles, unavailable, this.baseLevel);
    const resolved = new Map<string, GlobeSurfaceTile>();

    for (const tile of requestTiles) {
      const renderTile = this.deepestLoadedTile(tile, loaded, selection.level);

      if (renderTile) {
        resolved.set(renderTile.id, renderTile);
      }
    }

    return {
      level: effectiveSelectionLevel(requestTiles, selection.level),
      requestTiles,
      renderTiles: orderRenderTiles([...resolved.values()]),
    };
  }

  private deepestLoadedTile(tile: QuadtreeTile, loaded: ReadonlySet<string>, targetLevel: number): GlobeSurfaceTile | undefined {
    let current = tile;

    while (current.z >= this.baseLevel) {
      if (loaded.has(current.id)) {
        return {
          ...current,
          requestedId: tile.id,
          sourceTile: current,
          state: current.id === tile.id ? "exact" : "fallback",
          targetLevel,
        };
      }

      if (current.z === this.baseLevel) {
        return undefined;
      }

      current = parentTile(current);
    }

    return undefined;
  }
}

function isReadonlySet(value: CameraTileSelectorContext | ReadonlySet<string>): value is ReadonlySet<string> {
  return typeof (value as ReadonlySet<string>).has === "function";
}

function normalizeUnavailableRequests(
  tiles: readonly QuadtreeTile[],
  unavailable: ReadonlySet<string>,
  baseLevel: number,
): QuadtreeTile[] {
  const normalized = new Map<string, QuadtreeTile>();

  for (const tile of tiles) {
    const requestTile = highestAvailableAncestor(tile, unavailable, baseLevel);
    normalized.set(requestTile.id, requestTile);
  }

  return [...normalized.values()];
}

function highestAvailableAncestor(tile: QuadtreeTile, unavailable: ReadonlySet<string>, baseLevel: number): QuadtreeTile {
  let current = tile;

  while (current.z > baseLevel && unavailable.has(current.id)) {
    current = parentTile(current);
  }

  return current;
}

function effectiveSelectionLevel(tiles: readonly QuadtreeTile[], fallbackLevel: number): number {
  return tiles.reduce((level, tile) => Math.max(level, tile.z), tiles.length > 0 ? 0 : fallbackLevel);
}

function orderRenderTiles(tiles: GlobeSurfaceTile[]): GlobeSurfaceTile[] {
  return pruneOverlappingRenderTiles(tiles).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

function parentTile(tile: QuadtreeTile): QuadtreeTile {
  return createQuadtreeTile(Math.floor(tile.x / 2), Math.floor(tile.y / 2), tile.z - 1);
}

function pruneOverlappingRenderTiles(tiles: readonly GlobeSurfaceTile[]): GlobeSurfaceTile[] {
  const selected: GlobeSurfaceTile[] = [];

  for (const tile of [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)) {
    if (selected.some((ancestor) => isDescendantOf(tile, ancestor))) {
      continue;
    }

    selected.push(tile);
  }

  return selected;
}

function isDescendantOf(tile: QuadtreeTile, ancestor: QuadtreeTile): boolean {
  if (tile.z <= ancestor.z) {
    return false;
  }

  const factor = 2 ** (tile.z - ancestor.z);
  return Math.floor(tile.x / factor) === ancestor.x && Math.floor(tile.y / factor) === ancestor.y;
}
