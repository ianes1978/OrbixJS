export const PREPROCESS_MANIFEST_SCHEMA_VERSION = "0.1";

export type PreprocessManifest = {
  schemaVersion: typeof PREPROCESS_MANIFEST_SCHEMA_VERSION;
  jobs: PreprocessJob[];
};

export type PreprocessJobType =
  | "terrain-heightmap"
  | "imagery-raster"
  | "vector-features"
  | "gltf"
  | "tileset"
  | "weather-field";

export type PreprocessJob = {
  id: string;
  type: PreprocessJobType;
  title?: string;
  inputs: PreprocessArtifact[];
  outputs: PreprocessArtifact[];
  crs?: string;
  extent?: PreprocessExtent;
  parameters?: PreprocessParameters;
  provenance: PreprocessProvenance;
  attribution?: string;
  license?: string;
};

export type PreprocessArtifact = {
  id: string;
  url: string;
  format: string;
  crs?: string;
  hash?: string;
  tileMatrixSet?: string;
};

export type PreprocessExtent = {
  west: number;
  south: number;
  east: number;
  north: number;
  crs: string;
};

export type PreprocessParameters = Record<string, string | number | boolean | null>;

export type PreprocessProvenance = {
  tool: string;
  toolVersion?: string;
  createdAt?: string;
};

type RawPreprocessManifest = {
  schemaVersion?: unknown;
  jobs?: unknown;
};

type RawPreprocessJob = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  crs?: unknown;
  extent?: unknown;
  parameters?: unknown;
  provenance?: unknown;
  attribution?: unknown;
  license?: unknown;
};

type RawPreprocessArtifact = {
  id?: unknown;
  url?: unknown;
  format?: unknown;
  crs?: unknown;
  hash?: unknown;
  tileMatrixSet?: unknown;
};

type RawPreprocessExtent = {
  west?: unknown;
  south?: unknown;
  east?: unknown;
  north?: unknown;
  crs?: unknown;
};

type RawPreprocessProvenance = {
  tool?: unknown;
  toolVersion?: unknown;
  createdAt?: unknown;
};

export function parsePreprocessManifest(json: unknown): PreprocessManifest {
  const manifest = expectObject<RawPreprocessManifest>(json, "preprocessManifest");
  const schemaVersion = expectString(manifest.schemaVersion, "preprocessManifest.schemaVersion");

  if (schemaVersion !== PREPROCESS_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported PreprocessManifest schema version: ${schemaVersion}`);
  }

  if (!Array.isArray(manifest.jobs)) {
    throw new Error("Invalid PreprocessManifest jobs");
  }

  return {
    schemaVersion,
    jobs: manifest.jobs.map(parsePreprocessJob),
  };
}

export async function loadPreprocessManifest(url: string): Promise<PreprocessManifest> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load PreprocessManifest: ${response.status}`);
  }

  return parsePreprocessManifest(await response.json());
}

export function findPreprocessJob(manifest: PreprocessManifest, id: string): PreprocessJob | undefined {
  return manifest.jobs.find((job) => job.id === id);
}

export function serializePreprocessManifest(manifest: PreprocessManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parsePreprocessJob(value: unknown, index: number): PreprocessJob {
  const job = expectObject<RawPreprocessJob>(value, `preprocessManifest.jobs[${index}]`);
  const type = expectJobType(job.type, `preprocessManifest.jobs[${index}].type`);

  return {
    id: expectString(job.id, `preprocessManifest.jobs[${index}].id`),
    type,
    title: optionalString(job.title, `preprocessManifest.jobs[${index}].title`),
    inputs: parseArtifacts(job.inputs, `preprocessManifest.jobs[${index}].inputs`),
    outputs: parseArtifacts(job.outputs, `preprocessManifest.jobs[${index}].outputs`),
    crs: optionalString(job.crs, `preprocessManifest.jobs[${index}].crs`),
    extent: job.extent === undefined ? undefined : parseExtent(job.extent, `preprocessManifest.jobs[${index}].extent`),
    parameters: job.parameters === undefined ? undefined : parseParameters(job.parameters, `preprocessManifest.jobs[${index}].parameters`),
    provenance: parseProvenance(job.provenance, `preprocessManifest.jobs[${index}].provenance`),
    attribution: optionalString(job.attribution, `preprocessManifest.jobs[${index}].attribution`),
    license: optionalString(job.license, `preprocessManifest.jobs[${index}].license`),
  };
}

function parseArtifacts(value: unknown, path: string): PreprocessArtifact[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Invalid PreprocessManifest artifacts at ${path}`);
  }

  return value.map((entry, index) => {
    const artifact = expectObject<RawPreprocessArtifact>(entry, `${path}[${index}]`);

    return {
      id: expectString(artifact.id, `${path}[${index}].id`),
      url: expectString(artifact.url, `${path}[${index}].url`),
      format: expectString(artifact.format, `${path}[${index}].format`),
      crs: optionalString(artifact.crs, `${path}[${index}].crs`),
      hash: optionalString(artifact.hash, `${path}[${index}].hash`),
      tileMatrixSet: optionalString(artifact.tileMatrixSet, `${path}[${index}].tileMatrixSet`),
    };
  });
}

function parseExtent(value: unknown, path: string): PreprocessExtent {
  const extent = expectObject<RawPreprocessExtent>(value, path);

  return {
    west: expectNumber(extent.west, `${path}.west`),
    south: expectNumber(extent.south, `${path}.south`),
    east: expectNumber(extent.east, `${path}.east`),
    north: expectNumber(extent.north, `${path}.north`),
    crs: expectString(extent.crs, `${path}.crs`),
  };
}

function parseParameters(value: unknown, path: string): PreprocessParameters {
  const parameters = expectObject<Record<string, unknown>>(value, path);
  const parsed: PreprocessParameters = {};

  for (const [key, parameter] of Object.entries(parameters)) {
    if (
      parameter !== null &&
      typeof parameter !== "string" &&
      typeof parameter !== "number" &&
      typeof parameter !== "boolean"
    ) {
      throw new Error(`Invalid PreprocessManifest parameter at ${path}.${key}`);
    }

    parsed[key] = parameter;
  }

  return parsed;
}

function parseProvenance(value: unknown, path: string): PreprocessProvenance {
  const provenance = expectObject<RawPreprocessProvenance>(value, path);

  return {
    tool: expectString(provenance.tool, `${path}.tool`),
    toolVersion: optionalString(provenance.toolVersion, `${path}.toolVersion`),
    createdAt: optionalString(provenance.createdAt, `${path}.createdAt`),
  };
}

function expectJobType(value: unknown, path: string): PreprocessJobType {
  const type = expectString(value, path);

  if (
    type !== "terrain-heightmap" &&
    type !== "imagery-raster" &&
    type !== "vector-features" &&
    type !== "gltf" &&
    type !== "tileset" &&
    type !== "weather-field"
  ) {
    throw new Error(`Unsupported PreprocessJob type: ${type}`);
  }

  return type;
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

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid number at ${path}`);
  }

  return value;
}
