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
        },
      ],
    });

    expect(findDataSource(catalog, "world-imagery")).toMatchObject({
      crs: "EPSG:3857",
      minLevel: 0,
      maxLevel: 6,
      tileSize: 256,
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
