import { applyLodBiasToLevel, type LodContext, type NormalizedLodOptions } from "./lod";

export type GlobeLodPolicyInput = {
  projectedImageryLevel?: number;
  projectedTerrainLevel?: number;
  metricImageryLevel?: number;
  cameraSlope: number;
  altitudeMeters: number;
  options: NormalizedLodOptions;
  context: LodContext;
};

export type GlobeLodPolicyResult = {
  imageryLevel?: number;
  terrainLevel?: number;
  requestedImageryTargetLevel?: number;
  requestedTerrainTargetLevel?: number;
  equalizedTerrainZoom: boolean;
};

export function selectGlobeLodTargets({
  projectedImageryLevel,
  projectedTerrainLevel,
  metricImageryLevel,
  cameraSlope,
  altitudeMeters,
  options,
  context,
}: GlobeLodPolicyInput): GlobeLodPolicyResult {
  const imageryLevel = maxFiniteLevel(projectedImageryLevel, metricImageryLevel);
  const terrainInputLevel = projectedTerrainLevel ?? metricImageryLevel;
  const requestedImageryTargetLevel = maxFiniteLevel(
    applyLodBiasToLevel(imageryLevel, options.imagery, context),
    clampLodLayerLevel(metricImageryLevel, options.imagery),
  );
  const requestedTerrainLevel = applyLodBiasToLevel(terrainInputLevel, options.terrain, context);
  const equalizedTerrainZoom = shouldEqualizeTerrainZoom({
    altitudeMeters,
    cameraSlope,
    minAltitudeMeters: options.terrain.equalZoomMinAltitudeMeters,
    maxAltitudeMeters: options.terrain.equalZoomMaxAltitudeMeters,
    minCameraSlope: options.terrain.equalZoomMinCameraSlope,
  });
  const requestedTerrainTargetLevel =
    equalizedTerrainZoom && requestedImageryTargetLevel !== undefined && requestedTerrainLevel !== undefined
      ? Math.min(options.terrain.maxLevel, Math.max(requestedTerrainLevel, requestedImageryTargetLevel))
      : requestedTerrainLevel;

  return {
    imageryLevel,
    terrainLevel: terrainInputLevel,
    requestedImageryTargetLevel,
    requestedTerrainTargetLevel,
    equalizedTerrainZoom,
  };
}

export function shouldEqualizeTerrainZoom({
  altitudeMeters,
  cameraSlope,
  minAltitudeMeters = 10_000,
  maxAltitudeMeters = 15_000_000,
  minCameraSlope = 0.8,
}: {
  altitudeMeters: number;
  cameraSlope: number;
  minAltitudeMeters?: number;
  maxAltitudeMeters?: number;
  minCameraSlope?: number;
}): boolean {
  return (
    Number.isFinite(altitudeMeters) &&
    Number.isFinite(cameraSlope) &&
    altitudeMeters > minAltitudeMeters &&
    altitudeMeters < maxAltitudeMeters &&
    cameraSlope > minCameraSlope
  );
}

function clampLodLayerLevel(
  level: number | undefined,
  layer: { minLevel: number; maxLevel: number },
): number | undefined {
  if (level === undefined || !Number.isFinite(level)) {
    return undefined;
  }

  return Math.min(layer.maxLevel, Math.max(layer.minLevel, Math.round(level)));
}

function maxFiniteLevel(...levels: (number | undefined)[]): number | undefined {
  const finite = levels.filter((level): level is number => level !== undefined && Number.isFinite(level));

  return finite.length > 0 ? Math.max(...finite) : undefined;
}
