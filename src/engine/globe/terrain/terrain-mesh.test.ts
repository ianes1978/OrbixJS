import { describe, expect, it } from "vitest";
import { cross, dot, normalize, subtract } from "../../core/math/vec3";
import { createFlatTerrainTile } from "./terrain-provider";
import { createTerrainMesh, terrainGridSizeForLevel, tileSampleToCartographic } from "./terrain-mesh";

describe("terrain-mesh", () => {
  it("builds a normalized terrain mesh from a heightmap tile", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 1, y: 1 }, { size: 3, height: 1000 });
    const mesh = createTerrainMesh(tile);

    expect(mesh.positions).toHaveLength(3 * 3 * 3);
    expect(mesh.normals).toHaveLength(3 * 3 * 3);
    expect(mesh.texcoords).toHaveLength(3 * 3 * 2);
    expect(mesh.indices).toHaveLength(2 * 2 * 6);
    expect(mesh.minHeight).toBe(1000);
    expect(mesh.maxHeight).toBe(1000);
    expect(mesh.texcoords[0]).toBe(0);
    expect(mesh.texcoords[1]).toBe(0);
    expect(mesh.texcoords[mesh.texcoords.length - 2]).toBe(1);
    expect(mesh.texcoords[mesh.texcoords.length - 1]).toBe(1);
  });

  it("maps terrain tile samples through WebMercator coordinates", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 1, y: 1 });
    const topLeft = tileSampleToCartographic(tile, 0, 0);
    const bottomRight = tileSampleToCartographic(tile, 1, 1);

    expect(topLeft.lon).toBeCloseTo(0);
    expect(topLeft.lat).toBeCloseTo(0);
    expect(bottomRight.lon).toBeCloseTo(Math.PI);
    expect(bottomRight.lat).toBeCloseTo(-1.4844222297453324);
  });

  it("orients generated triangles outward from the ellipsoid", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 1, y: 1 }, { size: 3 });
    const mesh = createTerrainMesh(tile);
    const a = vertexAt(mesh.positions, mesh.indices[0]);
    const b = vertexAt(mesh.positions, mesh.indices[1]);
    const c = vertexAt(mesh.positions, mesh.indices[2]);
    const faceNormal = normalize(cross(subtract(b, a), subtract(c, a)));
    const center = normalize([
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ]);

    expect(dot(faceNormal, center)).toBeGreaterThan(0);
  });

  it("uses uint32 indices for large terrain meshes", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 1, y: 1 }, { size: 257 });
    const mesh = createTerrainMesh(tile);

    expect(mesh.indices).toBeInstanceOf(Uint32Array);
  });

  it("can triangulate a heightmap with a level-driven grid size", () => {
    const tile = createFlatTerrainTile({ level: 10, x: 1, y: 1 }, { size: 33, height: 1000 });
    const mesh = createTerrainMesh(tile, { gridSizeByLevel: [32, 32, 16, 16, 8, 8, 8, 6, 6, 4, 4] });

    expect(terrainGridSizeForLevel(10, { gridSizeByLevel: [32, 32, 16, 16, 8, 8, 8, 6, 6, 4, 4] })).toBe(4);
    expect(mesh.positions).toHaveLength(5 * 5 * 3);
    expect(mesh.indices).toHaveLength(4 * 4 * 6);
    expect(mesh.minHeight).toBe(1000);
    expect(mesh.maxHeight).toBe(1000);
  });

  it("adds optional skirts around terrain tile borders", () => {
    const tile = createFlatTerrainTile({ level: 1, x: 1, y: 1 }, { size: 3, height: 1000 });
    const mesh = createTerrainMesh(tile, { skirtDepth: 50 });
    const baseVertexCount = tile.width * tile.height;
    const skirtVertexCount = tile.width * 2 + (tile.height - 2) * 2;

    expect(mesh.hasSkirt).toBe(true);
    expect(mesh.positions).toHaveLength((baseVertexCount + skirtVertexCount) * 3);
    expect(mesh.texcoords).toHaveLength((baseVertexCount + skirtVertexCount) * 2);
    expect(mesh.indices.length).toBeGreaterThan((tile.width - 1) * (tile.height - 1) * 6);
    expect(vertexLength(mesh.positions, baseVertexCount)).toBeLessThan(vertexLength(mesh.positions, 0));
  });
});

function vertexAt(positions: Float32Array, index: number): [number, number, number] {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function vertexLength(positions: Float32Array, index: number): number {
  const vertex = vertexAt(positions, index);

  return Math.hypot(vertex[0], vertex[1], vertex[2]);
}
