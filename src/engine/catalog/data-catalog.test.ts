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
        },
      ],
    });

    expect(findDataSource(catalog, "world-imagery")?.crs).toBe("EPSG:3857");
  });

  it("rejects unsupported source types", () => {
    expect(() =>
      parseDataCatalog({
        schemaVersion: "0.1",
        sources: [{ id: "bad", type: "wms", title: "Bad", url: "https://example.test" }],
      }),
    ).toThrow("Unsupported DataCatalog source type");
  });
});
