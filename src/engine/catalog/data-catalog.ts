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
    minLevel: optionalNonNegativeInteger(source.minLevel, `catalog.sources[${index}].minLevel`),
    maxLevel: optionalNonNegativeInteger(source.maxLevel, `catalog.sources[${index}].maxLevel`),
    tileSize: optionalPositiveInteger(source.tileSize, `catalog.sources[${index}].tileSize`),
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
