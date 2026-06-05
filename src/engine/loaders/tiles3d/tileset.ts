export type TilesetJson = {
  asset: {
    version: string;
  };
  geometricError: number;
  root: TilesetTile;
};

export type TilesetTile = {
  boundingVolume: TilesetBoundingVolume;
  geometricError: number;
  refine?: "ADD" | "REPLACE";
  content?: TilesetContent;
  children: TilesetTile[];
};

export type TilesetContent = {
  uri: string;
  resolvedUri: string;
};

export type TilesetBoundingVolume =
  | { type: "region"; values: [number, number, number, number, number, number] }
  | { type: "box"; values: [number, number, number, number, number, number, number, number, number, number, number, number] }
  | { type: "sphere"; values: [number, number, number, number] };

export type TilesetCartographicPlacement = {
  lon: number;
  lat: number;
  height: number;
};

type RawTileset = {
  asset?: {
    version?: unknown;
  };
  geometricError?: unknown;
  root?: unknown;
};

type RawTile = {
  boundingVolume?: unknown;
  geometricError?: unknown;
  refine?: unknown;
  content?: unknown;
  children?: unknown;
};

type RawContent = {
  uri?: unknown;
  url?: unknown;
};

export function parseTilesetJson(json: unknown, baseUrl: string): TilesetJson {
  const tileset = expectObject<RawTileset>(json, "tileset");
  const version = expectString(tileset.asset?.version, "asset.version");

  if (!version.startsWith("1.")) {
    throw new Error(`Unsupported 3D Tiles version: ${version}`);
  }

  return {
    asset: { version },
    geometricError: expectNumber(tileset.geometricError, "geometricError"),
    root: parseTile(tileset.root, baseUrl, "root"),
  };
}

export async function loadTilesetJson(url: string): Promise<TilesetJson> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load tileset.json: ${response.status}`);
  }

  return parseTilesetJson(await response.json(), response.url);
}

export function tileBoundingVolumeCenter(tile: TilesetTile): TilesetCartographicPlacement | undefined {
  if (tile.boundingVolume.type !== "region") {
    return undefined;
  }

  const [west, south, east, north, minHeight, maxHeight] = tile.boundingVolume.values;

  return {
    lon: radiansToDegrees((west + east) * 0.5),
    lat: radiansToDegrees((south + north) * 0.5),
    height: (minHeight + maxHeight) * 0.5,
  };
}

function parseTile(value: unknown, baseUrl: string, path: string): TilesetTile {
  const tile = expectObject<RawTile>(value, path);
  const refine = parseRefine(tile.refine, path);
  const children = Array.isArray(tile.children)
    ? tile.children.map((child, index) => parseTile(child, baseUrl, `${path}.children[${index}]`))
    : [];

  return {
    boundingVolume: parseBoundingVolume(tile.boundingVolume, `${path}.boundingVolume`),
    geometricError: expectNumber(tile.geometricError, `${path}.geometricError`),
    refine,
    content: parseContent(tile.content, baseUrl, `${path}.content`),
    children,
  };
}

function parseBoundingVolume(value: unknown, path: string): TilesetBoundingVolume {
  const boundingVolume = expectObject<Record<string, unknown>>(value, path);

  if ("region" in boundingVolume) {
    return { type: "region", values: expectNumberTuple(boundingVolume.region, 6, `${path}.region`) };
  }

  if ("box" in boundingVolume) {
    return { type: "box", values: expectNumberTuple(boundingVolume.box, 12, `${path}.box`) };
  }

  if ("sphere" in boundingVolume) {
    return { type: "sphere", values: expectNumberTuple(boundingVolume.sphere, 4, `${path}.sphere`) };
  }

  throw new Error(`Invalid 3D Tiles bounding volume at ${path}`);
}

function parseContent(value: unknown, baseUrl: string, path: string): TilesetContent | undefined {
  if (value === undefined) {
    return undefined;
  }

  const content = expectObject<RawContent>(value, path);
  const uri = expectString(content.uri ?? content.url, `${path}.uri`);

  return {
    uri,
    resolvedUri: new URL(uri, baseUrl).href,
  };
}

function parseRefine(value: unknown, path: string): "ADD" | "REPLACE" | undefined {
  if (value === undefined) {
    return undefined;
  }

  const refine = expectString(value, `${path}.refine`).toUpperCase();

  if (refine !== "ADD" && refine !== "REPLACE") {
    throw new Error(`Invalid 3D Tiles refine mode at ${path}.refine`);
  }

  return refine;
}

function expectObject<T extends object>(value: unknown, path: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid 3D Tiles object at ${path}`);
  }

  return value as T;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid 3D Tiles string at ${path}`);
  }

  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid 3D Tiles number at ${path}`);
  }

  return value;
}

function expectNumberTuple<TLength extends 4 | 6 | 12>(
  value: unknown,
  length: TLength,
  path: string,
): TLength extends 4
  ? [number, number, number, number]
  : TLength extends 6
    ? [number, number, number, number, number, number]
    : [number, number, number, number, number, number, number, number, number, number, number, number] {
  if (!Array.isArray(value) || value.length !== length || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`Invalid 3D Tiles number tuple at ${path}`);
  }

  return value as never;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
