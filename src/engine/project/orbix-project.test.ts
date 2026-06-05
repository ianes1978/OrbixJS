import { describe, expect, it } from "vitest";
import {
  migrateOrbixProject,
  ORBIX_PROJECT_SCHEMA_VERSION,
  ORBIX_PROJECT_SUPPORTED_SCHEMA_VERSIONS,
  parseOrbixProject,
  resolveOrbixLayerCrs,
  serializeOrbixProject,
} from "./orbix-project";

describe("parseOrbixProject", () => {
  it("parses a versioned project document", () => {
    const project = parseOrbixProject({
      schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
      name: "Demo",
      catalogUrl: "/catalog.json",
      crs: { project: "EPSG:4326", heightReference: "ellipsoid" },
      camera: { lon: 11.35, lat: 46.5, height: 1000 },
      layers: [
        { id: "basemap", type: "imagery-xyz", source: "world-imagery", crs: "EPSG:3857", visible: true },
        { id: "demo-tiles", type: "tileset", source: "demo-tileset" },
      ],
    });

    expect(project.name).toBe("Demo");
    expect(project.layers).toHaveLength(2);
    expect(project.layers[0]?.crs).toBe("EPSG:3857");
    expect(project.layers[1]?.type).toBe("tileset");
  });

  it("resolves effective layer CRS from layer, source, then project", () => {
    const project = parseOrbixProject({
      schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
      name: "Demo",
      crs: { project: "EPSG:4326", heightReference: "ellipsoid" },
      layers: [
        { id: "layer-crs", type: "imagery-xyz", source: "source-a", crs: "EPSG:3857" },
        { id: "source-crs", type: "imagery-xyz", source: "source-b" },
        { id: "project-crs", type: "tileset", source: "source-c" },
      ],
    });

    expect(resolveOrbixLayerCrs(project, project.layers[0], { crs: "EPSG:25832" })).toMatchObject({
      effective: "EPSG:3857",
      layer: "EPSG:3857",
      source: "EPSG:25832",
    });
    expect(resolveOrbixLayerCrs(project, project.layers[1], { crs: "EPSG:25832" }).effective).toBe("EPSG:25832");
    expect(resolveOrbixLayerCrs(project, project.layers[2]).effective).toBe("EPSG:4326");
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

  it("migrates legacy project documents before validation", () => {
    const project = parseOrbixProject({
      schemaVersion: "0.0",
      name: "Legacy",
      crs: "EPSG:4326",
      layers: [],
    });

    expect(project.schemaVersion).toBe(ORBIX_PROJECT_SCHEMA_VERSION);
    expect(project.crs).toEqual({ project: "EPSG:4326", heightReference: "ellipsoid" });
  });

  it("exposes supported schema versions", () => {
    expect(ORBIX_PROJECT_SUPPORTED_SCHEMA_VERSIONS).toContain("0.0");
    expect(ORBIX_PROJECT_SUPPORTED_SCHEMA_VERSIONS).toContain(ORBIX_PROJECT_SCHEMA_VERSION);
  });

  it("keeps current project documents unchanged during migration", () => {
    const current = {
      schemaVersion: ORBIX_PROJECT_SCHEMA_VERSION,
      name: "Current",
      crs: { project: "EPSG:4326" },
      layers: [],
    };

    expect(migrateOrbixProject(current)).toBe(current);
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
