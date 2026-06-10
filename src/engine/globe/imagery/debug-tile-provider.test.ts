import { afterEach, describe, expect, it, vi } from "vitest";
import { DebugTileProvider } from "./debug-tile-provider";

describe("DebugTileProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates cached canvas tiles with the requested size", async () => {
    const context = createCanvasContextStub();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    const provider = new DebugTileProvider({ tileSize: 128 });

    const first = await provider.loadTile({ z: 4, x: 8, y: 5 });
    const second = await provider.loadTile({ z: 4, x: 8, y: 5 });

    expect(first).toBe(canvas);
    expect(second).toBe(canvas);
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(128);
    expect(provider.cacheSize).toBe(1);
    expect(context.fillText).toHaveBeenCalledWith("4/8/5", 64, expect.any(Number));
  });

  it("can deliberately reject selected tiles to simulate holes", async () => {
    const provider = new DebugTileProvider({ missingModulo: 1 });

    await expect(provider.loadTile({ z: 4, x: 8, y: 5 })).rejects.toThrow("Debug missing tile 4/8/5");
  });
});

function createCanvasContextStub(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
