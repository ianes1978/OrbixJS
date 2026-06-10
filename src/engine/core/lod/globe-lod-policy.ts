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
};

export function selectGlobeLodTargets({
  projectedImageryLevel,
  projectedTerrainLevel,
  metricImageryLevel,
  options,
  context,
}: GlobeLodPolicyInput): GlobeLodPolicyResult {
  const imageryLevel = maxFiniteLevel(projectedImageryLevel, metricImageryLevel);
  const terrainInputLevel = projectedTerrainLevel ?? metricImageryLevel;
  const requestedImageryTargetLevel = maxFiniteLevel(
    applyLodBiasToLevel(imageryLevel, options.imagery, context),
    clampLodLayerLevel(metricImageryLevel, options.imagery),
  );
  const requestedTerrainTargetLevel = applyLodBiasToLevel(terrainInputLevel, options.terrain, context);

  return {
    imageryLevel,
    terrainLevel: terrainInputLevel,
    requestedImageryTargetLevel,
    requestedTerrainTargetLevel,
  };
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
