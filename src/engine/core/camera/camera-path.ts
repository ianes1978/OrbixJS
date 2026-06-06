export type CameraPathMode = "orbit" | "first-person" | "look-at" | "terrain-follow";

export type CameraPathEasing = "linear" | "smoothstep";

export type CameraKeyframe = {
  lon: number;
  lat: number;
  height: number;
  heading?: number;
  pitch?: number;
  fov?: number;
  duration?: number;
  easing?: CameraPathEasing;
};

export type CameraPath = {
  id: string;
  name?: string;
  mode?: CameraPathMode;
  loop?: boolean;
  keyframes: CameraKeyframe[];
};

export type CameraPathSample = Required<Pick<CameraKeyframe, "lon" | "lat" | "height">> &
  Pick<CameraKeyframe, "heading" | "pitch" | "fov"> & {
    segmentIndex: number;
    progress: number;
    finished: boolean;
  };

export function validateCameraPath(path: CameraPath): CameraPath {
  if (!path.id) {
    throw new Error("Invalid CameraPath id");
  }

  if (!Array.isArray(path.keyframes) || path.keyframes.length === 0) {
    throw new Error("CameraPath requires at least one keyframe");
  }

  for (const [index, keyframe] of path.keyframes.entries()) {
    validateFiniteNumber(keyframe.lon, `cameraPath.keyframes[${index}].lon`);
    validateFiniteNumber(keyframe.lat, `cameraPath.keyframes[${index}].lat`);
    validateFiniteNumber(keyframe.height, `cameraPath.keyframes[${index}].height`);

    if (keyframe.duration !== undefined && (!Number.isFinite(keyframe.duration) || keyframe.duration < 0)) {
      throw new Error(`Invalid cameraPath.keyframes[${index}].duration`);
    }

    if (keyframe.easing !== undefined && keyframe.easing !== "linear" && keyframe.easing !== "smoothstep") {
      throw new Error(`Invalid cameraPath.keyframes[${index}].easing`);
    }
  }

  return path;
}

export function cameraPathDuration(path: CameraPath): number {
  validateCameraPath(path);

  return path.keyframes.slice(1).reduce((total, keyframe) => total + segmentDuration(keyframe), 0);
}

export function sampleCameraPath(path: CameraPath, elapsedSeconds: number): CameraPathSample {
  validateCameraPath(path);

  const keyframes = path.keyframes;

  if (keyframes.length === 1) {
    return sampleFromKeyframe(keyframes[0], 0, 1, true);
  }

  const totalDuration = cameraPathDuration(path);
  const time =
    path.loop && totalDuration > 0
      ? positiveModulo(elapsedSeconds, totalDuration)
      : Math.min(Math.max(elapsedSeconds, 0), totalDuration);
  let cursor = 0;

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const from = keyframes[index];
    const to = keyframes[index + 1];
    const duration = segmentDuration(to);
    const segmentEnd = cursor + duration;
    const isLast = index === keyframes.length - 2;

    if (time <= segmentEnd || isLast) {
      const rawProgress = duration === 0 ? 1 : Math.min(Math.max((time - cursor) / duration, 0), 1);
      const progress = applyEasing(rawProgress, to.easing ?? "smoothstep");

      return {
        lon: interpolateAngleDegrees(from.lon, to.lon, progress),
        lat: lerp(from.lat, to.lat, progress),
        height: lerp(from.height, to.height, progress),
        heading: interpolateOptionalAngle(from.heading, to.heading, progress),
        pitch: interpolateOptional(from.pitch, to.pitch, progress),
        fov: interpolateOptional(from.fov, to.fov, progress),
        segmentIndex: index,
        progress: rawProgress,
        finished: !path.loop && isLast && rawProgress >= 1,
      };
    }

    cursor = segmentEnd;
  }

  return sampleFromKeyframe(keyframes[keyframes.length - 1], keyframes.length - 2, 1, true);
}

function sampleFromKeyframe(
  keyframe: CameraKeyframe,
  segmentIndex: number,
  progress: number,
  finished: boolean,
): CameraPathSample {
  return {
    lon: keyframe.lon,
    lat: keyframe.lat,
    height: keyframe.height,
    heading: keyframe.heading,
    pitch: keyframe.pitch,
    fov: keyframe.fov,
    segmentIndex,
    progress,
    finished,
  };
}

function validateFiniteNumber(value: number, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${path}`);
  }
}

function segmentDuration(keyframe: CameraKeyframe): number {
  return keyframe.duration ?? 1;
}

function applyEasing(value: number, easing: CameraPathEasing): number {
  if (easing === "linear") {
    return value;
  }

  return value * value * (3 - 2 * value);
}

function interpolateOptional(from: number | undefined, to: number | undefined, progress: number): number | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  return lerp(from ?? to ?? 0, to ?? from ?? 0, progress);
}

function interpolateOptionalAngle(
  from: number | undefined,
  to: number | undefined,
  progress: number,
): number | undefined {
  if (from === undefined && to === undefined) {
    return undefined;
  }

  return interpolateAngleDegrees(from ?? to ?? 0, to ?? from ?? 0, progress);
}

function interpolateAngleDegrees(from: number, to: number, progress: number): number {
  return normalizeDegrees(from + shortestDeltaDegrees(from, to) * progress);
}

function shortestDeltaDegrees(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function normalizeDegrees(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
