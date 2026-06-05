import { describe, expect, it } from "vitest";
import { length } from "../math/vec3";
import { sunDirectionFromDate } from "./sun-position";

describe("sunDirectionFromDate", () => {
  it("returns a normalized ECEF-like direction", () => {
    const direction = sunDirectionFromDate(new Date("2026-06-05T12:00:00Z"));

    expect(length(direction)).toBeCloseTo(1, 6);
  });

  it("keeps equinox sunlight near the equator", () => {
    const direction = sunDirectionFromDate(new Date("2026-03-20T14:46:00Z"));

    expect(Math.abs(direction[1])).toBeLessThan(0.02);
  });

  it("moves solar declination north and south across solstices", () => {
    const june = sunDirectionFromDate(new Date("2026-06-21T10:24:00Z"));
    const december = sunDirectionFromDate(new Date("2026-12-21T16:03:00Z"));

    expect(june[1]).toBeGreaterThan(0.35);
    expect(december[1]).toBeLessThan(-0.35);
  });
});
