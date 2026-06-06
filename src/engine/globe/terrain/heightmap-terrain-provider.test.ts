import { describe, expect, it, vi } from "vitest";
import {
  createHeightmapTerrainProvider,
  parseHeightmapTerrainManifest,
  type HeightmapTerrainManifest,
} from "./heightmap-terrain-provider";

const manifest: HeightmapTerrainManifest = {
  schemaVersion: "0.1",
  tileUrlTemplate: "tiles/{z}/{x}/{y}.bin",
  tileSize: 2,
  minLevel: 1,
  maxLevel: 1,
  encoding: "float32",
  tileMatrixSet: "WebMercatorQuad",
};

describe("heightmap-terrain-provider", () => {
  it("parses a heightmap terrain manifest", () => {
    expect(parseHeightmapTerrainManifest(manifest)).toEqual(manifest);
  });

  it("rejects unsupported heightmap encodings", () => {
    expect(() =>
      parseHeightmapTerrainManifest({
        ...manifest,
        encoding: "uint16",
      }),
    ).toThrow("Unsupported heightmap encoding");
  });

  it("loads float32 terrain tiles and keeps them available for synchronous sampling", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe("https://example.test/runtime/tiles/1/1/1.bin");
      return new Response(float32Tile([10, 20, 30, 40]));
    });
    const provider = createHeightmapTerrainProvider(manifest, {
      baseUrl: "https://example.test/runtime/manifest.json",
      fetch: fetchMock,
    });
    const tile = await provider.getTile({ level: 1, x: 1, y: 1 });

    expect(tile.minHeight).toBe(10);
    expect(tile.maxHeight).toBe(40);
    expect([...tile.heights]).toEqual([10, 20, 30, 40]);
    expect(provider.sampleHeight?.(0, 0)).toBeCloseTo(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await provider.getTile({ level: 1, x: 1, y: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores noData values when sampling", async () => {
    const provider = createHeightmapTerrainProvider(
      {
        ...manifest,
        noData: -9999,
      },
      {
        fetch: async () => new Response(float32Tile([100, -9999, -9999, -9999])),
      },
    );

    await provider.getTile({ level: 1, x: 1, y: 1 });

    expect(provider.sampleHeight?.(0, 0)).toBe(100);
  });

  it("rejects out-of-range terrain tile requests", async () => {
    const provider = createHeightmapTerrainProvider(manifest, {
      fetch: async () => new Response(float32Tile([0, 0, 0, 0])),
    });

    await expect(provider.getTile({ level: 2, x: 0, y: 0 })).rejects.toThrow("Terrain tile level out of range");
  });
});

function float32Tile(values: readonly number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(values.length * 4);
  const view = new DataView(buffer);

  values.forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });

  return buffer;
}
