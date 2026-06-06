import { describe, expect, it } from "vitest";
import { createFlatTerrainProvider, createFlatTerrainTile, createTerrainTileId } from "./terrain-provider";

describe("terrain-provider", () => {
  it("creates stable terrain tile ids", () => {
    expect(createTerrainTileId({ level: 3, x: 4, y: 2 })).toBe("3/4/2");
  });

  it("creates a flat heightmap tile", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 0, y: 1 }, { size: 3, height: 1250 });

    expect(tile.width).toBe(3);
    expect(tile.height).toBe(3);
    expect(tile.heights).toHaveLength(9);
    expect([...tile.heights]).toEqual(Array(9).fill(1250));
    expect(tile.minHeight).toBe(1250);
    expect(tile.maxHeight).toBe(1250);
  });

  it("creates a flat terrain provider with synchronous height sampling", async () => {
    const provider = createFlatTerrainProvider(42);
    const tile = await provider.getTile({ level: 0, x: 0, y: 0 });

    expect(tile.minHeight).toBe(42);
    expect(tile.maxHeight).toBe(42);
    expect(provider.sampleHeight?.(0.2, 0.4)).toBe(42);
  });
});
