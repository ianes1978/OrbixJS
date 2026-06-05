import { describe, expect, it } from "vitest";
import { decodeTopoJsonLand } from "./topojson-land";

describe("decodeTopoJsonLand", () => {
  it("decodes delta encoded arcs with transform", () => {
    const lines = decodeTopoJsonLand({
      transform: {
        scale: [0.5, 1],
        translate: [-180, -90],
      },
      arcs: [
        [
          [0, 0],
          [20, 10],
          [10, -5],
        ],
      ],
      objects: {
        land: {
          type: "Polygon",
          arcs: [[0]],
        },
      },
    });

    expect(lines).toEqual([
      [
        [-180, -90],
        [-170, -80],
        [-165, -85],
      ],
    ]);
  });

  it("reverses negative arc references", () => {
    const lines = decodeTopoJsonLand({
      arcs: [
        [
          [1, 1],
          [1, 0],
          [0, 1],
        ],
      ],
      objects: {
        land: {
          type: "Polygon",
          arcs: [[-1]],
        },
      },
    });

    expect(lines).toEqual([
      [
        [2, 2],
        [2, 1],
        [1, 1],
      ],
    ]);
  });
});
