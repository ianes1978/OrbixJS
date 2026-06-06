import { type DataSourceDescriptor } from "../catalog/data-catalog";
import { validateCameraPath, type CameraPath, type CameraKeyframe } from "../core/camera/camera-path";

export const ORBIX_PROJECT_SCHEMA_VERSION = "0.1";
export const ORBIX_PROJECT_SUPPORTED_SCHEMA_VERSIONS = ["0.0", ORBIX_PROJECT_SCHEMA_VERSION] as const;

export type OrbixProjectSchemaVersion = (typeof ORBIX_PROJECT_SUPPORTED_SCHEMA_VERSIONS)[number];

export type OrbixProject = {
  schemaVersion: typeof ORBIX_PROJECT_SCHEMA_VERSION;
  name: string;
  catalogUrl?: string;
  crs: {
    project: string;
    heightReference?: "ellipsoid" | "orthometric" | "terrain";
  };
  camera?: {
    lon: number;
    lat: number;
    height: number;
  };
  cameraPaths?: CameraPath[];
  layers: OrbixProjectLayer[];
};

export type OrbixProjectLayer = {
  id: string;
  source: string;
  type: "imagery-xyz" | "tileset" | "terrain-heightmap";
  crs?: string;
  visible?: boolean;
  opacity?: number;
};

export type OrbixLayerCrsResolution = {
  project: string;
  source?: string;
  layer?: string;
  effective: string;
  heightReference?: "ellipsoid" | "orthometric" | "terrain";
};

type RawOrbixProject = {
  schemaVersion?: unknown;
  name?: unknown;
  catalogUrl?: unknown;
  crs?: unknown;
  camera?: unknown;
  cameraPaths?: unknown;
  layers?: unknown;
};

type RawOrbixProjectLayer = {
  id?: unknown;
  source?: unknown;
  type?: unknown;
  crs?: unknown;
  visible?: unknown;
  opacity?: unknown;
};

export function parseOrbixProject(json: unknown): OrbixProject {
  const project = expectObject<RawOrbixProject>(migrateOrbixProject(json), "project");
  const schemaVersion = expectString(project.schemaVersion, "project.schemaVersion");

  if (schemaVersion !== ORBIX_PROJECT_SCHEMA_VERSION) {
    throw new Error(`Unsupported OrbixProject schema version: ${schemaVersion}`);
  }

  return {
    schemaVersion,
    name: expectString(project.name, "project.name"),
    catalogUrl: optionalString(project.catalogUrl, "project.catalogUrl"),
    crs: parseProjectCrs(project.crs),
    camera: project.camera === undefined ? undefined : parseProjectCamera(project.camera),
    cameraPaths: project.cameraPaths === undefined ? undefined : parseProjectCameraPaths(project.cameraPaths),
    layers: parseProjectLayers(project.layers),
  };
}

export function migrateOrbixProject(json: unknown): unknown {
  const project = expectObject<RawOrbixProject>(json, "project");
  const schemaVersion = expectString(project.schemaVersion, "project.schemaVersion");

  if (schemaVersion === ORBIX_PROJECT_SCHEMA_VERSION) {
    return project;
  }

  if (schemaVersion === "0.0") {
    return migrateProjectV0ToV01(project);
  }

  throw new Error(`Unsupported OrbixProject schema version: ${schemaVersion}`);
}

export async function loadOrbixProject(url: string): Promise<OrbixProject> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load OrbixProject: ${response.status}`);
  }

  return parseOrbixProject(await response.json());
}

export function serializeOrbixProject(project: OrbixProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

function migrateProjectV0ToV01(project: RawOrbixProject): RawOrbixProject {
  const crs =
    typeof project.crs === "string"
      ? { project: project.crs, heightReference: "ellipsoid" }
      : project.crs ?? { project: "EPSG:4326", heightReference: "ellipsoid" };

  return {
    ...project,
    schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
    crs,
  };
}

function parseProjectCrs(value: unknown): OrbixProject["crs"] {
  const crs = expectObject<{ project?: unknown; heightReference?: unknown }>(value, "project.crs");
  const heightReference = optionalString(crs.heightReference, "project.crs.heightReference");

  if (
    heightReference !== undefined &&
    heightReference !== "ellipsoid" &&
    heightReference !== "orthometric" &&
    heightReference !== "terrain"
  ) {
    throw new Error("Invalid OrbixProject height reference");
  }

  return {
    project: expectString(crs.project, "project.crs.project"),
    heightReference,
  };
}

function parseProjectCamera(value: unknown): OrbixProject["camera"] {
  const camera = expectObject<{ lon?: unknown; lat?: unknown; height?: unknown }>(value, "project.camera");

  return {
    lon: expectNumber(camera.lon, "project.camera.lon"),
    lat: expectNumber(camera.lat, "project.camera.lat"),
    height: expectNumber(camera.height, "project.camera.height"),
  };
}

function parseProjectCameraPaths(value: unknown): CameraPath[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid OrbixProject cameraPaths");
  }

  return value.map((entry, index) => {
    const path = expectObject<{
      id?: unknown;
      name?: unknown;
      mode?: unknown;
      loop?: unknown;
      keyframes?: unknown;
    }>(entry, `project.cameraPaths[${index}]`);
    const mode = optionalString(path.mode, `project.cameraPaths[${index}].mode`);

    if (
      mode !== undefined &&
      mode !== "orbit" &&
      mode !== "first-person" &&
      mode !== "look-at" &&
      mode !== "terrain-follow"
    ) {
      throw new Error(`Unsupported CameraPath mode: ${mode}`);
    }

    return validateCameraPath({
      id: expectString(path.id, `project.cameraPaths[${index}].id`),
      name: optionalString(path.name, `project.cameraPaths[${index}].name`),
      mode,
      loop: optionalBoolean(path.loop, `project.cameraPaths[${index}].loop`),
      keyframes: parseCameraKeyframes(path.keyframes, `project.cameraPaths[${index}].keyframes`),
    });
  });
}

function parseCameraKeyframes(value: unknown, path: string): CameraKeyframe[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${path}`);
  }

  return value.map((entry, index) => {
    const keyframe = expectObject<{
      lon?: unknown;
      lat?: unknown;
      height?: unknown;
      heading?: unknown;
      pitch?: unknown;
      fov?: unknown;
      duration?: unknown;
      easing?: unknown;
    }>(entry, `${path}[${index}]`);
    const easing = optionalString(keyframe.easing, `${path}[${index}].easing`);

    if (easing !== undefined && easing !== "linear" && easing !== "smoothstep") {
      throw new Error(`Invalid ${path}[${index}].easing`);
    }

    return {
      lon: expectNumber(keyframe.lon, `${path}[${index}].lon`),
      lat: expectNumber(keyframe.lat, `${path}[${index}].lat`),
      height: expectNumber(keyframe.height, `${path}[${index}].height`),
      heading: optionalNumber(keyframe.heading, `${path}[${index}].heading`),
      pitch: optionalNumber(keyframe.pitch, `${path}[${index}].pitch`),
      fov: optionalNumber(keyframe.fov, `${path}[${index}].fov`),
      duration: optionalNumber(keyframe.duration, `${path}[${index}].duration`),
      easing,
    };
  });
}

function parseProjectLayers(value: unknown): OrbixProjectLayer[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid OrbixProject layers");
  }

  return value.map((entry, index) => {
    const layer = expectObject<RawOrbixProjectLayer>(entry, `project.layers[${index}]`);
    const type = expectString(layer.type, `project.layers[${index}].type`);

    if (type !== "imagery-xyz" && type !== "tileset" && type !== "terrain-heightmap") {
      throw new Error(`Unsupported OrbixProject layer type: ${type}`);
    }

    return {
      id: expectString(layer.id, `project.layers[${index}].id`),
      source: expectString(layer.source, `project.layers[${index}].source`),
      type,
      crs: optionalString(layer.crs, `project.layers[${index}].crs`),
      visible: optionalBoolean(layer.visible, `project.layers[${index}].visible`),
      opacity: optionalNumber(layer.opacity, `project.layers[${index}].opacity`),
    };
  });
}

export function resolveOrbixLayerCrs(
  project: OrbixProject,
  layer: OrbixProjectLayer,
  source?: Pick<DataSourceDescriptor, "crs">,
): OrbixLayerCrsResolution {
  return {
    project: project.crs.project,
    source: source?.crs,
    layer: layer.crs,
    effective: layer.crs ?? source?.crs ?? project.crs.project,
    heightReference: project.crs.heightReference,
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

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid number at ${path}`);
  }

  return value;
}

function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectNumber(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid boolean at ${path}`);
  }

  return value;
}
