import { add, cross, dot, length, normalize, scale, type MutableVec3, type Vec3 } from "../math/vec3";
import { Ellipsoid, type Cartographic } from "./ellipsoid";

export type LocalFrameENU = {
  origin: MutableVec3;
  east: MutableVec3;
  north: MutableVec3;
  up: MutableVec3;
};

export function createLocalFrameENU(cartographic: Cartographic, ellipsoid = Ellipsoid.WGS84): LocalFrameENU {
  const origin = ellipsoid.cartographicToCartesian(cartographic);
  const up = ellipsoid.geodeticSurfaceNormal(cartographic.lon, cartographic.lat);
  const east = createEastAxis(cartographic.lon, up);
  const north = normalize(cross(up, east));

  return { origin, east, north, up };
}

export function localEnuToCartesian(frame: LocalFrameENU, local: Vec3): MutableVec3 {
  return add(add(add(frame.origin, scale(frame.east, local[0])), scale(frame.north, local[1])), scale(frame.up, local[2]));
}

export function localEnuToRenderUnit(frame: LocalFrameENU, local: Vec3, ellipsoid = Ellipsoid.WGS84): MutableVec3 {
  const cartesian = localEnuToCartesian(frame, local);
  const maxRadius = ellipsoid.maximumRadius;

  return [cartesian[0] / maxRadius, cartesian[1] / maxRadius, cartesian[2] / maxRadius];
}

function createEastAxis(lon: number, up: Vec3): MutableVec3 {
  const east = cross([0, 1, 0], up);

  if (length(east) > 1e-10 && Math.abs(dot(east, up)) < 1e-8) {
    return normalize(east);
  }

  return normalize([-Math.sin(lon), 0, -Math.cos(lon)]);
}
