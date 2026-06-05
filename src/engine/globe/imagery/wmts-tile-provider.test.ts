import { describe, expect, it } from "vitest";
import { WMTSTileProvider } from "./wmts-tile-provider";

describe("WMTSTileProvider", () => {
  it("expands WMTS REST placeholders", () => {
    const provider = new WMTSTileProvider({
      url: "https://tiles.test/{Layer}/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png",
      layer: "world",
      style: "default",
      tileMatrixSet: "WebMercatorQuad",
      tileMatrixPrefix: "EPSG:3857:",
    });

    expect(provider.buildTileUrl({ x: 4, y: 2, z: 3 })).toBe(
      "https://tiles.test/world/default/WebMercatorQuad/EPSG%3A3857%3A3/2/4.png",
    );
  });

  it("builds WMTS KVP requests when no placeholders are present", () => {
    const provider = new WMTSTileProvider({
      url: "https://tiles.test/wmts",
      layer: "ortho",
      tileMatrixSet: "GoogleMapsCompatible",
      format: "image/jpeg",
    });
    const url = new URL(provider.buildTileUrl({ x: 1, y: 2, z: 3 }));

    expect(url.searchParams.get("Service")).toBe("WMTS");
    expect(url.searchParams.get("Request")).toBe("GetTile");
    expect(url.searchParams.get("Layer")).toBe("ortho");
    expect(url.searchParams.get("Format")).toBe("image/jpeg");
    expect(url.searchParams.get("TileMatrixSet")).toBe("GoogleMapsCompatible");
    expect(url.searchParams.get("TileMatrix")).toBe("3");
    expect(url.searchParams.get("TileCol")).toBe("1");
    expect(url.searchParams.get("TileRow")).toBe("2");
  });
});
