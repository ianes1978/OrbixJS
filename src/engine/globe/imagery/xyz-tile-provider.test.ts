import { describe, expect, it } from "vitest";
import { XYZTileProvider } from "./xyz-tile-provider";

describe("XYZTileProvider", () => {
  it("expands xyz and subdomain placeholders", () => {
    const provider = new XYZTileProvider({
      url: "https://{s}.tiles.test/{z}/{x}/{y}.png",
      subdomains: ["a", "b"],
    });

    expect(provider.buildTileUrl({ x: 1, y: 2, z: 3 })).toBe("https://a.tiles.test/3/1/2.png");
  });
});
