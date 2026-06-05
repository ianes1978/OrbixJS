import { type MutableVec3 } from "../math/vec3";

const DEG_TO_RAD = Math.PI / 180;
const UNIX_EPOCH_JULIAN_DATE = 2440587.5;
const MILLISECONDS_PER_DAY = 86_400_000;

export function sunDirectionFromDate(date: Date): MutableVec3 {
  const julianDate = date.getTime() / MILLISECONDS_PER_DAY + UNIX_EPOCH_JULIAN_DATE;
  const daysSinceJ2000 = julianDate - 2451545.0;

  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * daysSinceJ2000);
  const meanAnomaly = normalizeDegrees(357.528 + 0.9856003 * daysSinceJ2000) * DEG_TO_RAD;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG_TO_RAD;
  const obliquity = (23.439 - 0.0000004 * daysSinceJ2000) * DEG_TO_RAD;

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const siderealTime = normalizeDegrees(280.46061837 + 360.98564736629 * daysSinceJ2000) * DEG_TO_RAD;
  const longitude = normalizeRadians(rightAscension - siderealTime);

  const cosLat = Math.cos(declination);

  return [
    cosLat * Math.cos(longitude),
    Math.sin(declination),
    -cosLat * Math.sin(longitude),
  ];
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeRadians(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((value + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}
