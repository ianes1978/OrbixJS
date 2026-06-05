import {
  createWebMercatorQuadMatrixSet,
  createTileMatrixSetDescriptor,
  maxTileMatrixLevel,
  minTileMatrixLevel,
  type TileMatrixDescriptor,
  type TileMatrixSetDescriptor,
  type TileMatrixSetExtent,
} from "../globe/tiling/tile-matrix-set";

export type DataCatalog = {
  schemaVersion: "0.1";
  sources: DataSourceDescriptor[];
};

export type DataSourceDescriptor = {
  id: string;
  type: "imagery-xyz" | "tileset" | "terrain-heightmap";
  title: string;
  url: string;
  crs?: string;
  attribution?: string;
  license?: string;
  minLevel?: number;
  maxLevel?: number;
  tileSize?: number;
  tileMatrixSet?: TileMatrixSetDescriptor;
};

type RawDataCatalog = {
  schemaVersion?: unknown;
  sources?: unknown;
};

type RawDataSourceDescriptor = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  url?: unknown;
  crs?: unknown;
  attribution?: unknown;
  license?: unknown;
  minLevel?: unknown;
  maxLevel?: unknown;
  tileSize?: unknown;
  tileMatrixSet?: unknown;
};

type RawTileMatrixSetDescriptor = {
  id?: unknown;
  crs?: unknown;
  extent?: unknown;
  matrices?: unknown;
};

type RawTileMatrixSetExtent = {
  west?: unknown;
  south?: unknown;
  east?: unknown;
  north?: unknown;
};

type RawTileMatrixDescriptor = {
  level?: unknown;
  matrixWidth?: unknown;
  matrixHeight?: unknown;
  tileWidth?: unknown;
  tileHeight?: unknown;
};

export function parseDataCatalog(json: unknown): DataCatalog {
  const catalog = expectObject<RawDataCatalog>(json, "catalog");
  const schemaVersion = expectString(catalog.schemaVersion, "catalog.schemaVersion");

  if (schemaVersion !== "0.1") {
    throw new Error(`Unsupported DataCatalog schema version: ${schemaVersion}`);
  }

  if (!Array.isArray(catalog.sources)) {
    throw new Error("Invalid DataCatalog sources");
  }

  return {
    schemaVersion,
    sources: catalog.sources.map(parseSource),
  };
}

export async function loadDataCatalog(url: string): Promise<DataCatalog> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load DataCatalog: ${response.status}`);
  }

  return parseDataCatalog(await response.json());
}

export function findDataSource(catalog: DataCatalog, id: string): DataSourceDescriptor | undefined {
  return catalog.sources.find((source) => source.id === id);
}

function parseSource(value: unknown, index: number): DataSourceDescriptor {
  const source = expectObject<RawDataSourceDescriptor>(value, `catalog.sources[${index}]`);
  const type = expectString(source.type, `catalog.sources[${index}].type`);
  const explicitMinLevel = optionalNonNegativeInteger(source.minLevel, `catalog.sources[${index}].minLevel`);
  const explicitMaxLevel = optionalNonNegativeInteger(source.maxLevel, `catalog.sources[${index}].maxLevel`);
  const explicitTileSize = optionalPositiveInteger(source.tileSize, `catalog.sources[${index}].tileSize`);
  const tileMatrixSet = optionalTileMatrixSet(
    source.tileMatrixSet,
    `catalog.sources[${index}].tileMatrixSet`,
    explicitMaxLevel,
    explicitTileSize,
  );
  const minLevel = explicitMinLevel ?? inferMinLevel(tileMatrixSet);
  const maxLevel = explicitMaxLevel ?? inferMaxLevel(tileMatrixSet);
  const tileSize = explicitTileSize ?? inferTileSize(tileMatrixSet);

  if (type !== "imagery-xyz" && type !== "tileset" && type !== "terrain-heightmap") {
    throw new Error(`Unsupported DataCatalog source type: ${type}`);
  }

  return {
    id: expectString(source.id, `catalog.sources[${index}].id`),
    type,
    title: expectString(source.title, `catalog.sources[${index}].title`),
    url: expectString(source.url, `catalog.sources[${index}].url`),
    crs: optionalString(source.crs, `catalog.sources[${index}].crs`),
    attribution: optionalString(source.attribution, `catalog.sources[${index}].attribution`),
    license: optionalString(source.license, `catalog.sources[${index}].license`),
    minLevel,
    maxLevel,
    tileSize,
    tileMatrixSet,
  };
}

function expectObject<T extends object>(value: unknown, path: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid object at ${path}`);
  }

  return value as T;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid string at ${path}`);
  }

  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, path);
}

function optionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid non-negative integer at ${path}`);
  }

  return value;
}

function optionalPositiveInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer at ${path}`);
  }

  return value;
}

function optionalTileMatrixSet(
  value: unknown,
  path: string,
  maxLevel: number | undefined,
  tileSize: number | undefined,
): TileMatrixSetDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "WebMercatorQuad") {
    return createWebMercatorQuadMatrixSet(maxLevel ?? 22, tileSize ?? 256);
  }

  const matrixSet = expectObject<RawTileMatrixSetDescriptor>(value, path);

  if (!Array.isArray(matrixSet.matrices)) {
    throw new Error(`Invalid TileMatrixSet matrices at ${path}.matrices`);
  }

  return createTileMatrixSetDescriptor({
    id: expectString(matrixSet.id, `${path}.id`),
    crs: expectString(matrixSet.crs, `${path}.crs`),
    extent: parseTileMatrixSetExtent(matrixSet.extent, `${path}.extent`),
    matrices: matrixSet.matrices.map((matrix, matrixIndex) => parseTileMatrix(matrix, `${path}.matrices[${matrixIndex}]`)),
  });
}

function parseTileMatrixSetExtent(value: unknown, path: string): TileMatrixSetExtent {
  const extent = expectObject<RawTileMatrixSetExtent>(value, path);

  return {
    west: expectNumber(extent.west, `${path}.west`),
    south: expectNumber(extent.south, `${path}.south`),
    east: expectNumber(extent.east, `${path}.east`),
    north: expectNumber(extent.north, `${path}.north`),
  };
}

function parseTileMatrix(value: unknown, path: string): TileMatrixDescriptor {
  const matrix = expectObject<RawTileMatrixDescriptor>(value, path);

  return {
    level: expectNonNegativeInteger(matrix.level, `${path}.level`),
    matrixWidth: expectPositiveInteger(matrix.matrixWidth, `${path}.matrixWidth`),
    matrixHeight: expectPositiveInteger(matrix.matrixHeight, `${path}.matrixHeight`),
    tileWidth: expectPositiveInteger(matrix.tileWidth, `${path}.tileWidth`),
    tileHeight: expectPositiveInteger(matrix.tileHeight, `${path}.tileHeight`),
  };
}

function inferMinLevel(matrixSet: TileMatrixSetDescriptor | undefined): number | undefined {
  return matrixSet ? minTileMatrixLevel(matrixSet) : undefined;
}

function inferMaxLevel(matrixSet: TileMatrixSetDescriptor | undefined): number | undefined {
  return matrixSet ? maxTileMatrixLevel(matrixSet) : undefined;
}

function inferTileSize(matrixSet: TileMatrixSetDescriptor | undefined): number | undefined {
  const firstMatrix = matrixSet?.matrices[0];

  if (!firstMatrix || firstMatrix.tileWidth !== firstMatrix.tileHeight) {
    return undefined;
  }

  return firstMatrix.tileWidth;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid number at ${path}`);
  }

  return value;
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid non-negative integer at ${path}`);
  }

  return value;
}

function expectPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer at ${path}`);
  }

  return value;
}
