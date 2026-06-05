import { describe, expect, it } from "vitest";
import { parseTilesetJson } from "./tileset";
import { selectTilesetTile } from "./tile-selector";

describe("selectTilesetTile", () => {
  it("keeps the root tile when the screen-space error is acceptable", () => {
    const tileset = createTwoLevelTileset();

    const selected = selectTilesetTile(tileset.root, 3.2);

    if (!selected) {
      throw new Error("Expected root tile to be selected");
    }

    expect(selected.depth).toBe(0);
    expect(selected.tile.content?.uri).toBe("root.glb");
  });

  it("selects a child tile when the camera is close enough", () => {
    const tileset = createTwoLevelTileset();

    const selected = selectTilesetTile(tileset.root, 1.2);

    if (!selected) {
      throw new Error("Expected child tile to be selected");
    }

    expect(selected.depth).toBe(1);
    expect(selected.tile.content?.uri).toBe("child.glb");
  });

  it("culls the tileset when its root center is behind the camera", () => {
    const tileset = createTwoLevelTileset();

    const selected = selectTilesetTile(tileset.root, 1.2, {
      cameraPosition: [0, 0, 3],
      cameraTarget: [0, 0, 0],
    });

    expect(selected).toBeUndefined();
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
