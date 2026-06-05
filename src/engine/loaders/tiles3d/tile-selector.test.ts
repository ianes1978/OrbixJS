import { describe, expect, it } from "vitest";
import { parseTilesetJson } from "./tileset";
import { selectTilesetTile } from "./tile-selector";

describe("selectTilesetTile", () => {
  it("keeps the root tile when the screen-space error is acceptable", () => {
    const tileset = createTwoLevelTileset();

    const selected = selectTilesetTile(tileset.root, 3.2);

    expect(selected.depth).toBe(0);
    expect(selected.tile.content?.uri).toBe("root.glb");
  });

  it("selects a child tile when the camera is close enough", () => {
    const tileset = createTwoLevelTileset();

    const selected = selectTilesetTile(tileset.root, 1.2);

    expect(selected.depth).toBe(1);
    expect(selected.tile.content?.uri).toBe("child.glb");
  });
});

function createTwoLevelTileset() {
  return parseTilesetJson(
    {
      asset: { version: "1.1" },
      geometricError: 200000,
      root: {
        boundingVolume: { region: [0, 0, 1, 1, 0, 1000] },
        geometricError: 200000,
        content: { uri: "root.glb" },
        children: [
          {
            boundingVolume: { region: [0.2, 0.2, 0.8, 0.8, 0, 500] },
            geometricError: 0,
            content: { uri: "child.glb" },
          },
        ],
      },
    },
    "https://example.test/tileset.json",
  );
}
