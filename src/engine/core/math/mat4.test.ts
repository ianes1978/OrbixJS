import { describe, expect, it } from "vitest";
import { identity, invert, multiply, transformPoint } from "./mat4";

describe("mat4", () => {
  it("multiplies by identity", () => {
    const product = multiply(identity(), identity());

    expect([...product]).toEqual([...identity()]);
  });

  it("inverts identity", () => {
    const inverse = invert(identity());

    expect([...inverse]).toEqual([...identity()]);
  });

  it("transforms points", () => {
    expect(transformPoint(identity(), [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
