import { describe, expect, it } from "vitest";
import { findDataSource, parseDataCatalog } from "./data-catalog";

describe("parseDataCatalog", () => {
  it("parses source descriptors", () => {
    const catalog = parseDataCatalog({
      schemaVersion: "0.1",
      sources: [
        {
          id: "world-imagery",
          type: "imagery-xyz",
          title: "World Imagery",
          url: "https://example.test/{z}/{y}/{x}",
          crs: "EPSG:3857",
          minLevel: 0,
          maxLevel: 6,
          tileSize: 256,
          tileMatrixSet: "WebMercatorQuad",
        },
      ],
    });

    expect(findDataSource(catalog, "world-imagery")).toMatchObject({
      crs: "EPSG:3857",
      minLevel: 0,
      maxLevel: 6,
      tileSize: 256,
      tileMatrixSet: {
        id: "WebMercatorQuad",
        crs: "EPSG:3857",
      },
    });
  });

  it("parses custom tile matrix set descriptors", () => {
    const catalog = parseDataCatalog({
      schemaVersion: "0.1",
      sources: [
        {
          id: "ortho-25832",
          type: "imagery-xyz",
          title: "Ortho EPSG:25832",
          url: "https://example.test/{z}/{y}/{x}",
          crs: "EPSG:25832",
          tileMatrixSet: {
            id: "EPSG_25832",
            crs: "EPSG:25832",
            extent: { west: 520000, south: 5100000, east: 820000, north: 5300000 },
            matrices: [
              { level: 0, matrixWidth: 1, matrixHeight: 1, tileWidth: 512, tileHeight: 512 },
              { level: 1, matrixWidth: 2, matrixHeight: 2, tileWidth: 512, tileHeight: 512 },
            ],
          },
        },
      ],
    });

    expect(findDataSource(catalog, "ortho-25832")).toMatchObject({
      minLevel: 0,
      maxLevel: 1,
      tileSize: 512,
      tileMatrixSet: {
        id: "EPSG_25832",
        crs: "EPSG:25832",
      },
    });
  });

  it("rejects unsupported source types", () => {
    expect(() =>
      parseDataCatalog({
        schemaVersion: "0.1",
        sources: [{ id: "bad", type: "wms", title: "Bad", url: "https://example.test" }],
      }),
    ).toThrow("Unsupported DataCatalog source type");
  });

  it("rejects invalid LOD metadata", () => {
    expect(() =>
      parseDataCatalog({
        schemaVersion: "0.1",
        sources: [{ id: "bad", type: "imagery-xyz", title: "Bad", url: "https://example.test", maxLevel: -1 }],
      }),
    ).toThrow("Invalid non-negative integer");
  });
});
