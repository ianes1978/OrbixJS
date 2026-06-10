import { describe, expect, it, vi } from "vitest";
import {
  createCivisQuantizedMeshTerrainProvider,
  parseCivisQuantizedMeshLayer,
} from "./civis-quantized-mesh-terrain-provider";

describe("civis-quantized-mesh-terrain-provider", () => {
  it("parses a CIVIS quantized mesh layer", () => {
    const layer = parseCivisQuantizedMeshLayer(layerJson());

    expect(layer.format).toBe("quantized-mesh-1.0");
    expect(layer.projection).toBe("EPSG:4326");
    expect(layer.available[0][0]).toMatchObject({ startX: 0, endX: 2, startY: 0, endY: 1 });
  });

  it("resamples quantized mesh source tiles into Orbix heightmap tiles", async () => {
    const layer = parseCivisQuantizedMeshLayer(layerJson());
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(quantizedMeshTile()));
    const provider = createCivisQuantizedMeshTerrainProvider(layer, {
      baseUrl: "https://example.test/terrain/layer.json",
      fetch: fetchMock,
      heightmapSize: 5,
    });

    const tile = await provider.getTile({ level: 0, x: 0, y: 0 });

    expect(tile.width).toBe(5);
    expect(tile.height).toBe(5);
    expect(tile.minHeight).toBeGreaterThanOrEqual(99.99);
    expect(tile.maxHeight).toBeLessThanOrEqual(500);
    expect(tile.maxHeight).toBeGreaterThan(tile.minHeight);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("samples terrain height from cached quantized mesh source tiles", async () => {
    const layer = parseCivisQuantizedMeshLayer(layerJson());
    const provider = createCivisQuantizedMeshTerrainProvider(layer, {
      baseUrl: "https://example.test/terrain/layer.json",
      fetch: vi.fn<typeof fetch>(async () => new Response(quantizedMeshTile())),
      heightmapSize: 5,
    });

    await provider.getTile({ level: 0, x: 0, y: 0 });

    const height = provider.sampleHeight?.(0, 0);

    expect(height).toBeGreaterThanOrEqual(99.99);
    expect(height).toBeLessThanOrEqual(500);
  });

  it("reports tile availability from layer bounds", () => {
    const layer = parseCivisQuantizedMeshLayer({ ...layerJson(), bounds: [-10, -10, 10, 10] });
    const provider = createCivisQuantizedMeshTerrainProvider(layer);

    expect(provider.isTileAvailable?.({ level: 0, x: 0, y: 0 })).toBe(true);
    expect(provider.isTileAvailable?.({ level: 2, x: 0, y: 0 })).toBe(false);
    expect(provider.isTileAvailable?.({ level: 2, x: 2, y: 2 })).toBe(true);
  });

  it("reports the native runtime level from source availability and source offset", () => {
    const layer = parseCivisQuantizedMeshLayer({ ...layerJson(), available: [[], [], []] });
    const provider = createCivisQuantizedMeshTerrainProvider(layer, { sourceLevelOffset: 1 });

    expect(provider.minLevel).toBe(0);
    expect(provider.maxNativeLevel).toBe(1);
  });

  it("rejects runtime tiles without available source terrain samples", async () => {
    const layer = parseCivisQuantizedMeshLayer({ ...layerJson(), available: [[]] });
    const provider = createCivisQuantizedMeshTerrainProvider(layer, {
      fetch: vi.fn<typeof fetch>(async () => new Response(quantizedMeshTile())),
      heightmapSize: 3,
    });

    expect(provider.isTileAvailable?.({ level: 0, x: 0, y: 0 })).toBe(false);
    await expect(provider.getTile({ level: 0, x: 0, y: 0 })).rejects.toThrow("No available CIVIS terrain source samples");
  });

  it("rejects unsupported terrain formats", () => {
    expect(() => parseCivisQuantizedMeshLayer({ ...layerJson(), format: "png" })).toThrow("Unsupported CIVIS terrain format");
  });
});

function layerJson(): Record<string, unknown> {
  return {
    format: "quantized-mesh-1.0",
    projection: "EPSG:4326",
    scheme: "tms",
    version: "1.0.0",
    tiles: ["{z}/{x}/{y}.terrain?v={version}"],
    bounds: [-180, -90, 180, 90],
    available: [[{ startX: 0, endX: 2, startY: 0, endY: 1 }]],
  };
}

function quantizedMeshTile(): ArrayBuffer {
  const vertexCount = 4;
  const triangleCount = 2;
  const buffer = new ArrayBuffer(88 + 4 + vertexCount * 2 * 3 + 4 + triangleCount * 3 * 2);
  const view = new DataView(buffer);
  let offset = 24;

  view.setFloat32(offset, 100, true);
  offset += 4;
  view.setFloat32(offset, 500, true);
  offset = 88;
  view.setUint32(offset, vertexCount, true);
  offset += 4;
  writeEncodedVertexBuffer(view, offset, [0, 32767, 0, 32767]);
  offset += vertexCount * 2;
  writeEncodedVertexBuffer(view, offset, [0, 0, 32767, 32767]);
  offset += vertexCount * 2;
  writeEncodedVertexBuffer(view, offset, [0, 32767, 32767, 0]);
  offset += vertexCount * 2;
  view.setUint32(offset, triangleCount, true);
  offset += 4;
  writeEncodedIndexBuffer(view, offset, [0, 1, 2, 1, 3, 2]);

  return buffer;
}

function writeEncodedVertexBuffer(view: DataView, offset: number, values: readonly number[]): void {
  let previous = 0;

  values.forEach((value, index) => {
    view.setUint16(offset + index * 2, zigZagEncode(value - previous), true);
    previous = value;
  });
}

function writeEncodedIndexBuffer(view: DataView, offset: number, indices: readonly number[]): void {
  let highest = 0;

  indices.forEach((value, index) => {
    const code = highest - value;
    view.setUint16(offset + index * 2, code, true);

    if (code === 0) {
      highest += 1;
    }
  });
}

function zigZagEncode(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}
