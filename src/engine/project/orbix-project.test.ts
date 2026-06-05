import { describe, expect, it } from "vitest";
import { ORBIX_PROJECT_SCHEMA_VERSION, parseOrbixProject, serializeOrbixProject } from "./orbix-project";

describe("parseOrbixProject", () => {
  it("parses a versioned project document", () => {
    const project = parseOrbixProject({
      schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
      name: "Demo",
      catalogUrl: "/catalog.json",
      crs: { project: "EPSG:4326", heightReference: "ellipsoid" },
      camera: { lon: 11.35, lat: 46.5, height: 1000 },
      layers: [
        { id: "basemap", type: "imagery-xyz", source: "world-imagery", visible: true },
        { id: "demo-tiles", type: "tileset", source: "demo-tileset" },
      ],
    });

    expect(project.name).toBe("Demo");
    expect(project.layers).toHaveLength(2);
    expect(project.layers[1]?.type).toBe("tileset");
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      parseOrbixProject({
        schemaVersion: "9.9",
        name: "Demo",
        crs: { project: "EPSG:4326" },
        layers: [],
      }),
    ).toThrow("Unsupported OrbixProject schema version");
  });

  it("serializes deterministically", () => {
    expect(
      serializeOrbixProject({
        schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
        name: "Demo",
        crs: { project: "EPSG:4326" },
        layers: [],
      }),
    ).toContain('"schemaVersion": "0.1"');
  });
});
