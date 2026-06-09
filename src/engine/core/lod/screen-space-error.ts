export type ScreenSpaceErrorInput = {
  geometricErrorMeters: number;
  distanceMeters: number;
  viewportHeight: number;
  fov: number;
};

export function computeScreenSpaceError({
  geometricErrorMeters,
  distanceMeters,
  viewportHeight,
  fov,
}: ScreenSpaceErrorInput): number {
  if (geometricErrorMeters <= 0) {
    return 0;
  }

  if (distanceMeters <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const denominator = 2 * Math.tan(fov / 2) * distanceMeters;

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (geometricErrorMeters * Math.max(1, viewportHeight)) / denominator;
}

export function shouldRefineByScreenSpaceError(
  screenSpaceError: number,
  maximumScreenSpaceError: number,
): boolean {
  if (!Number.isFinite(screenSpaceError)) {
    return true;
  }

  return screenSpaceError >= Math.max(0, maximumScreenSpaceError);
}
