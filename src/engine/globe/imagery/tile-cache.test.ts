import { describe, expect, it } from "vitest";
import { TileCache } from "./tile-cache";

describe("TileCache", () => {
  it("evicts least recently used entries", () => {
    const cache = new TileCache<number>(2);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("c")).toBe(true);
  });
});
