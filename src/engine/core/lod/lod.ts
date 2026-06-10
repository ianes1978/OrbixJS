export type LodProfile = "performance" | "balanced" | "quality" | "ultra";

export type LodLayerOptions = {
  minLevel?: number;
  maxLevel?: number;
  lodBias?: number;
  priority?: number;
  targetTilePixels?: number;
};

export type TileSelectionStrategyName = "classic" | "quadtree";

export type LodOptions =
  | LodProfile
  | {
      profile?: LodProfile;
      /** Strategia di selezione tile (Plan3): "quadtree" (SSE, default) o "classic" (legacy). */
      strategy?: TileSelectionStrategyName;
      adaptive?: boolean;
      devicePixelRatioLimit?: number;
      pixelErrorBudget?: number;
      maxVisibleTiles?: number;
      maxNetworkRequests?: number;
      maxGpuMemoryMb?: "auto" | number;
      qualityBias?: number;
      imagery?: LodLayerOptions;
      terrain?: LodLayerOptions & {
        maxTiles?: number;
        gridSizeByLevel?: readonly number[];
        equalZoomMinAltitudeMeters?: number;
        equalZoomMaxAltitudeMeters?: number;
        equalZoomMinCameraSlope?: number;
      };
      tiles3d?: {
        maxScreenSpaceError?: number;
        priority?: number;
      };
    };

export type NormalizedLodOptions = {
  profile: LodProfile;
  strategy: TileSelectionStrategyName;
  adaptive: boolean;
  devicePixelRatioLimit: number;
  pixelErrorBudget: number;
  maxVisibleTiles: number;
  maxNetworkRequests: number;
  maxGpuMemoryMb: number;
  qualityBias: number;
  imagery: Required<LodLayerOptions>;
  terrain: Required<LodLayerOptions> & {
    maxTiles: number;
    gridSizeByLevel: readonly number[];
    equalZoomMinAltitudeMeters: number;
    equalZoomMaxAltitudeMeters: number;
    equalZoomMinCameraSlope: number;
  };
  tiles3d: {
    maxScreenSpaceError: number;
    priority: number;
  };
};

export type AdaptiveLodState = {
  qualityReduction: number;
};

export type LodContext = {
  profile: LodProfile;
  adaptive: boolean;
  adaptiveQualityReduction: number;
  cameraDistance: number;
  altitudeMeters: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  fov: number;
  metersPerPixel: number;
  pixelErrorBudget: number;
  imageryTargetTilePixels: number;
  terrainTargetTilePixels: number;
  terrainEqualizedZoom: boolean;
  terrainGridSizeByLevel: readonly number[];
  tileBudget: number;
  requestBudget: number;
  gpuMemoryBudgetMb: number;
  qualityBias: number;
  tiles3dMaxScreenSpaceError: number;
};

export type LodContextInput = {
  cameraDistance: number;
  altitudeMeters: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio?: number;
  fov: number;
  adaptiveState?: AdaptiveLodState;
};

const earthRadiusMeters = 6_378_137;
const defaultTerrainGridSizeByLevel = [32, 32, 32, 24, 24, 16, 16, 16, 12, 12, 8, 8, 8, 6, 6, 4, 4, 4, 2, 2, 2];

const profileDefaults: Record<LodProfile, Omit<NormalizedLodOptions, "profile" | "strategy" | "imagery" | "terrain" | "tiles3d">> = {
  performance: {
    adaptive: true,
    devicePixelRatioLimit: 1.25,
    pixelErrorBudget: 1.45,
    maxVisibleTiles: 384,
    maxNetworkRequests: 12,
    maxGpuMemoryMb: 256,
    qualityBias: -1,
  },
  balanced: {
    adaptive: true,
    devicePixelRatioLimit: 1.5,
    pixelErrorBudget: 1.15,
    maxVisibleTiles: 768,
    maxNetworkRequests: 20,
    maxGpuMemoryMb: 512,
    qualityBias: 0,
  },
  quality: {
    adaptive: true,
    devicePixelRatioLimit: 2,
    pixelErrorBudget: 0.95,
    maxVisibleTiles: 1280,
    maxNetworkRequests: 28,
    maxGpuMemoryMb: 768,
    qualityBias: 0.5,
  },
  ultra: {
    adaptive: false,
    devicePixelRatioLimit: 2.5,
    pixelErrorBudget: 0.82,
    maxVisibleTiles: 2048,
    maxNetworkRequests: 36,
    maxGpuMemoryMb: 1024,
    qualityBias: 1,
  },
};

export function normalizeLodOptions(options: LodOptions | undefined): NormalizedLodOptions {
  const objectOptions = typeof options === "string" ? { profile: options } : options ?? {};
  const profile = objectOptions.profile ?? "balanced";
  const defaults = profileDefaults[profile];
  const maxVisibleTiles = objectOptions.maxVisibleTiles ?? defaults.maxVisibleTiles;
  const maxNetworkRequests = objectOptions.maxNetworkRequests ?? defaults.maxNetworkRequests;

  return {
    profile,
    strategy: objectOptions.strategy ?? "quadtree",
    adaptive: objectOptions.adaptive ?? defaults.adaptive,
    devicePixelRatioLimit: objectOptions.devicePixelRatioLimit ?? defaults.devicePixelRatioLimit,
    pixelErrorBudget: objectOptions.pixelErrorBudget ?? defaults.pixelErrorBudget,
    maxVisibleTiles,
    maxNetworkRequests,
    maxGpuMemoryMb:
      objectOptions.maxGpuMemoryMb === "auto" || objectOptions.maxGpuMemoryMb === undefined
        ? defaults.maxGpuMemoryMb
        : objectOptions.maxGpuMemoryMb,
    qualityBias: objectOptions.qualityBias ?? defaults.qualityBias,
    imagery: normalizeLayerOptions(objectOptions.imagery),
    terrain: {
      ...normalizeLayerOptions(objectOptions.terrain),
      maxTiles: objectOptions.terrain?.maxTiles ?? Math.max(64, Math.round(maxVisibleTiles * 0.25)),
      gridSizeByLevel: objectOptions.terrain?.gridSizeByLevel ?? defaultTerrainGridSizeByLevel,
      equalZoomMinAltitudeMeters: objectOptions.terrain?.equalZoomMinAltitudeMeters ?? 10_000,
      equalZoomMaxAltitudeMeters: objectOptions.terrain?.equalZoomMaxAltitudeMeters ?? 15_000_000,
      equalZoomMinCameraSlope: objectOptions.terrain?.equalZoomMinCameraSlope ?? 0.8,
    },
    tiles3d: {
      maxScreenSpaceError: objectOptions.tiles3d?.maxScreenSpaceError ?? tiles3dErrorForProfile(profile),
      priority: objectOptions.tiles3d?.priority ?? 60,
    },
  };
}

export function createAdaptiveLodState(): AdaptiveLodState {
  return { qualityReduction: 0 };
}

export function updateAdaptiveLodState(
  state: AdaptiveLodState,
  frameMs: number,
  options: NormalizedLodOptions,
): AdaptiveLodState {
  if (!options.adaptive || !Number.isFinite(frameMs)) {
    return state;
  }

  const highFrameMs = 24;
  const lowFrameMs = 18.5;
  let qualityReduction = state.qualityReduction;

  if (frameMs > highFrameMs) {
    qualityReduction += 0.08;
  } else if (frameMs < lowFrameMs) {
    qualityReduction -= 0.06;
  }

  return {
    qualityReduction: clamp(qualityReduction, 0, 2),
  };
}

export function createLodContext(options: NormalizedLodOptions, input: LodContextInput): LodContext {
  const reduction = options.adaptive ? input.adaptiveState?.qualityReduction ?? 0 : 0;
  const viewportHeight = Math.max(1, input.viewportHeight);
  const dpr = Math.min(options.devicePixelRatioLimit, Math.max(1, input.devicePixelRatio ?? 1));
  const visibleMeters = 2 * Math.max(0.5, input.altitudeMeters) * Math.tan(input.fov / 2);
  const metersPerPixel = visibleMeters / (viewportHeight * dpr);
  const reductionFactor = 1 + reduction * 0.5;
  const adaptiveQualityBias = reduction * 0.35;

  return {
    profile: options.profile,
    adaptive: options.adaptive,
    adaptiveQualityReduction: reduction,
    cameraDistance: input.cameraDistance,
    altitudeMeters: input.altitudeMeters,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    devicePixelRatio: dpr,
    fov: input.fov,
    metersPerPixel,
    pixelErrorBudget: options.pixelErrorBudget * reductionFactor,
    imageryTargetTilePixels: options.imagery.targetTilePixels,
    terrainTargetTilePixels: options.terrain.targetTilePixels,
    terrainEqualizedZoom: false,
    terrainGridSizeByLevel: options.terrain.gridSizeByLevel,
    tileBudget: Math.max(16, Math.round(options.maxVisibleTiles / reductionFactor)),
    requestBudget: Math.max(4, Math.round(options.maxNetworkRequests / (1 + reduction))),
    gpuMemoryBudgetMb: options.maxGpuMemoryMb,
    qualityBias: options.qualityBias - adaptiveQualityBias,
    tiles3dMaxScreenSpaceError: options.tiles3d.maxScreenSpaceError * reductionFactor,
  };
}

export function applyLodBiasToLevel(
  level: number | undefined,
  layer: Required<LodLayerOptions>,
  context: LodContext,
): number | undefined {
  if (level === undefined || !Number.isFinite(level)) {
    return undefined;
  }

  return clamp(Math.round(level + context.qualityBias + layer.lodBias), layer.minLevel, layer.maxLevel);
}

export function stabilizeLodLevel(
  previousLevel: number | undefined,
  nextLevel: number | undefined,
  { maxRise = 1, maxDrop = 1 }: { maxRise?: number; maxDrop?: number } = {},
): number | undefined {
  if (nextLevel === undefined || !Number.isFinite(nextLevel)) {
    return previousLevel;
  }

  const next = Math.round(nextLevel);

  if (previousLevel === undefined || !Number.isFinite(previousLevel)) {
    return next;
  }

  const previous = Math.round(previousLevel);

  if (next > previous) {
    return Math.min(next, previous + Math.max(1, maxRise));
  }

  if (next < previous) {
    return Math.max(next, previous - Math.max(1, maxDrop));
  }

  return next;
}

export function estimateAltitudeMeters(cameraDistance: number): number {
  return Math.max(cameraDistance - 1, 0) * earthRadiusMeters;
}

function normalizeLayerOptions(options: LodLayerOptions | undefined): Required<LodLayerOptions> {
  return {
    minLevel: options?.minLevel ?? 0,
    maxLevel: options?.maxLevel ?? 22,
    lodBias: options?.lodBias ?? 0,
    priority: options?.priority ?? 50,
    targetTilePixels: clamp(options?.targetTilePixels ?? 256, 32, 2048),
  };
}

function tiles3dErrorForProfile(profile: LodProfile): number {
  if (profile === "performance") {
    return 32;
  }

  if (profile === "quality") {
    return 8;
  }

  if (profile === "ultra") {
    return 4;
  }

  return 16;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
