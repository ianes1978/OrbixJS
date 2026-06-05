export type LonLatLine = Array<[number, number]>;

type Topology = {
  transform?: {
    scale: [number, number];
    translate: [number, number];
  };
  arcs: number[][][];
  objects: Record<string, Geometry | GeometryCollection>;
};

type GeometryCollection = {
  type: "GeometryCollection";
  geometries: Geometry[];
};

type Geometry =
  | {
      type: "Polygon";
      arcs: number[][];
    }
  | {
      type: "MultiPolygon";
      arcs: number[][][];
    };

export function decodeTopoJsonLand(topology: Topology, objectName = "land"): LonLatLine[] {
  const object = topology.objects[objectName];

  if (!object) {
    return [];
  }

  const decodedArcs = topology.arcs.map((arc) => decodeArc(topology, arc));
  const lines: LonLatLine[] = [];

  collectGeometryLines(object, decodedArcs, lines);
  return lines;
}

function collectGeometryLines(
  geometry: Geometry | GeometryCollection,
  decodedArcs: LonLatLine[],
  lines: LonLatLine[],
): void {
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectGeometryLines(child, decodedArcs, lines);
    }

    return;
  }

  if (geometry.type === "Polygon") {
    for (const ring of geometry.arcs) {
      lines.push(joinArcs(ring, decodedArcs));
    }

    return;
  }

  for (const polygon of geometry.arcs) {
    for (const ring of polygon) {
      lines.push(joinArcs(ring, decodedArcs));
    }
  }
}

function decodeArc(topology: Topology, arc: number[][]): LonLatLine {
  let x = 0;
  let y = 0;
  const line: LonLatLine = [];

  for (const point of arc) {
    x += point[0];
    y += point[1];
    line.push(transformPoint(topology, x, y));
  }

  return line;
}

function transformPoint(topology: Topology, x: number, y: number): [number, number] {
  const scale = topology.transform?.scale ?? [1, 1];
  const translate = topology.transform?.translate ?? [0, 0];
  return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
}

function joinArcs(arcIndexes: number[], decodedArcs: LonLatLine[]): LonLatLine {
  const line: LonLatLine = [];

  for (const arcIndex of arcIndexes) {
    const arc = arcIndex >= 0 ? decodedArcs[arcIndex] : [...decodedArcs[~arcIndex]].reverse();

    for (let index = 0; index < arc.length; index += 1) {
      if (line.length > 0 && index === 0) {
        continue;
      }

      line.push(arc[index]);
    }
  }

  return line;
}
