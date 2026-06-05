import { describe, expect, it } from "vitest";
import { parseTilesetJson, tileBoundingVolumeCenter } from "./tileset";

describe("parseTilesetJson", () => {
  it("parses a 3D Tiles tileset and resolves content URIs", () => {
    const tileset = parseTilesetJson(
      {
        asset: { version: "1.1" },
        geometricError: 500,
        root: {
          boundingVolume: { region: [0.1, 0.2, 0.3, 0.4, 10, 100] },
          geometricError: 250,
          refine: "replace",
          content: { uri: "tiles/root.glb" },
          children: [
            {
              boundingVolume: { sphere: [1, 2, 3, 4] },
              geometricError: 0,
              content: { url: "../child.glb" },
            },
          ],
        },
      },
      "https://example.test/tilesets/demo/tileset.json",
    );

    expect(tileset.asset.version).toBe("1.1");
    expect(tileset.root.refine).toBe("REPLACE");
    expect(tileset.root.boundingVolume).toEqual({
      type: "region",
      values: [0.1, 0.2, 0.3, 0.4, 10, 100],
    });
    expect(tileset.root.content?.resolvedUri).toBe("https://example.test/tilesets/demo/tiles/root.glb");
    expect(tileset.root.children[0]?.content?.resolvedUri).toBe("https://example.test/tilesets/child.glb");
  });

  it("derives a cartographic placement from a region bounding volume", () => {
    const tileset = parseTilesetJson(
      {
        asset: { version: "1.0" },
        geometricError: 0,
        root: {
          boundingVolume: {
            region: [
              degreesToRadians(10),
              degreesToRadians(40),
              degreesToRadians(20),
              degreesToRadians(50),
              100,
              300,
            ],
          },
          geometricError: 0,
        },
      },
      "https://example.test/tileset.json",
    );

    expect(tileBoundingVolumeCenter(tileset.root)).toEqual({
      lon: 14.999999999999998,
      lat: 45,
      height: 200,
    });
  });

  it("rejects unsupported versions", () => {
    expect(() =>
      parseTilesetJson(
        {
          asset: { version: "2.0" },
          geometricError: 0,
          root: {
            boundingVolume: { sphere: [0, 0, 0, 1] },
            geometricError: 0,
          },
        },
        "https://example.test/tileset.json",
      ),
    ).toThrow("Unsupported 3D Tiles version");
  });

  it("rejects malformed bounding volumes", () => {
    expect(() =>
      parseTilesetJson(
        {
          asset: { version: "1.0" },
          geometricError: 0,
          root: {
            boundingVolume: { region: [0, 1] },
            geometricError: 0,
          },
        },
        "https://example.test/tileset.json",
      ),
    ).toThrow("root.boundingVolume.region");
  });
});

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
