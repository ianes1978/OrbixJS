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
  const buffer = new ArrayBuffer(88 + 4 + vertexCount * 2 * 3);
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

  return buffer;
}

function writeEncodedVertexBuffer(view: DataView, offset: number, values: readonly number[]): void {
  let previous = 0;

  values.forEach((value, index) => {
    view.setUint16(offset + index * 2, zigZagEncode(value - previous), true);
    previous = value;
  });
}

function zigZagEncode(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}
