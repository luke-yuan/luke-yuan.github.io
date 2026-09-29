import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const stops = ["Conca", "Asinau", "Prati", "Vizzavona", "Petra Piana", "Ciottulu", "Carozzu", "Calenzana"];
const files = [
  "day1-conca-asinau.gpx", "day2-asinau-prati.gpx", "day3-prati-vizzavona.gpx",
  "day4-vizzavona-petra-piana.gpx", "day5-petra-piana-ciottulu.gpx",
  "day6-ciottulu-carrozzu.gpx", "day7-carrozzu-calenzana.gpx",
];
const colors = ["#a3482a", "#9a7013", "#527536", "#247b80", "#3964a0", "#7f5191", "#a83d62"];
const list = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const radians = (degrees) => degrees * Math.PI / 180;
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  parseTagValue: false,
  processEntities: false,
});

export function distanceMeters(a, b) {
  const h = Math.sin(radians(b[0] - a[0]) / 2) ** 2
    + Math.cos(radians(a[0])) * Math.cos(radians(b[0]))
    * Math.sin(radians(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Never connect separate tracks/segments: their gaps are not walked distance.
export function parseRoute(xml, name = "GPX") {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new Error(`${name}: invalid or unsupported GPX XML`);
  }
  const gpx = parser.parse(xml).gpx;
  let distance = 0;
  let gain = 0;
  let loss = 0;
  const segments = list(gpx?.trk).flatMap((track) => list(track.trkseg)).map((segment) => {
    let previous;
    return list(segment.trkpt).map((point) => {
      const raw = [point["@_lat"], point["@_lon"], point.ele];
      const values = raw.map(Number);
      if (raw.some((value) => typeof value !== "string" || !value.trim())
        || values.some((value) => !Number.isFinite(value))
        || Math.abs(values[0]) > 90 || Math.abs(values[1]) > 180) {
        throw new Error(`${name}: every track point needs valid coordinates and elevation`);
      }
      if (previous) {
        distance += distanceMeters(previous, values);
        gain += Math.max(0, values[2] - previous[2]);
        loss += Math.max(0, previous[2] - values[2]);
      }
      previous = values;
      return [...values, Math.round(distance)]; // lat, lon, elevation m, cumulative distance m
    });
  }).filter((segment) => segment.length);
  if (!segments.length || segments.some((segment) => segment.length < 2) || distance <= 0) {
    throw new Error(`${name}: expected track segments with at least two points and a nonzero distance`);
  }
  return { segments, distance, gain, loss };
}

export function metricLabels({ distance, gain }) {
  return {
    distanceLabel: (distance / 1000).toFixed(1),
    gainLabel: (Math.round(gain / 10) * 10).toLocaleString("en-US"),
  };
}

export function withTerrainElevations(route, cached, xml) {
  const hash = createHash("sha256").update(xml).digest("hex");
  if (cached?.gpxSha256 !== hash) throw new Error("IGN elevation cache is missing or stale; run python3 scripts/refresh-gr20-elevations.py");
  if (cached.elevations?.length !== route.segments.flat().length
    || cached.elevations.some((value) => !Number.isFinite(value) || value <= -100 || value >= 9000)) {
    throw new Error("IGN elevation cache has incomplete or invalid elevations");
  }
  let index = 0, gain = 0, loss = 0;
  const segments = route.segments.map((segment) => {
    let previous;
    return segment.map(([lat, lon, , distance]) => {
      const elevation = cached.elevations[index++];
      if (previous !== undefined) {
        gain += Math.max(0, elevation - previous);
        loss += Math.max(0, previous - elevation);
      }
      previous = elevation;
      return [lat, lon, elevation, distance];
    });
  });
  return { ...route, segments, gain, loss };
}

function overviewPaths(days) {
  // A self-contained route outline remains visible without JavaScript or a basemap.
  const project = ([lat, lon]) => [radians(lon), Math.log(Math.tan(Math.PI / 4 + radians(lat) / 2))];
  const points = days.flatMap((day) => day.segments.flat()).map(project);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(560 / (maxX - minX), 280 / (maxY - minY));
  const position = (point) => {
    const [x, y] = project(point);
    return [320 + (x - (minX + maxX) / 2) * scale, 180 - (y - (minY + maxY) / 2) * scale];
  };
  const paths = days.map((day) => day.segments.map((segment) => segment.map((point, i) =>
    `${i ? "L" : "M"}${position(point).map((value) => value.toFixed(1)).join(",")}`).join(" ")).join(" "));
  return {
    paths,
    start: position(days[0].segments[0][0]),
    end: position(days.at(-1).segments.at(-1).at(-1)),
  };
}

export async function loadRoutes({ elevationSource = "ign" } = {}) {
  if (!["ign", "gpx"].includes(elevationSource)) throw new Error("Unknown elevation source");
  const terrain = elevationSource === "ign"
    ? JSON.parse(await readFile(new URL("../data/gr20-ign-elevations.json", import.meta.url), "utf8")) : null;
  const days = await Promise.all(files.map(async (file, index) => {
    const xml = await readFile(new URL(`../src/assets/gr20/routes/${file}`, import.meta.url), "utf8");
    const original = parseRoute(xml, file);
    const metrics = terrain ? withTerrainElevations(original, terrain.routes[file], xml) : original;
    return {
      day: index + 1, from: stops[index], to: stops[index + 1],
      color: colors[index], gpx: `/assets/gr20/routes/${file}`,
      ...metrics, ...metricLabels(metrics),
    };
  }));
  const overview = overviewPaths(days);
  for (const [index, day] of days.entries()) {
    day.overviewPath = overview.paths[index];
    day.outline = overviewPaths([day]);
  }
  const totals = days.reduce((sum, day) => ({
    distance: sum.distance + day.distance,
    gain: sum.gain + day.gain,
    loss: sum.loss + day.loss,
  }), { distance: 0, gain: 0, loss: 0 });
  return {
    days, totals: { ...totals, ...metricLabels(totals) }, overview,
    source: terrain ? {
      ...terrain.source,
      retrievedDate: files.map((file) => terrain.routes[file].retrievedAt).sort().at(-1).slice(0, 10),
    } : { name: "Original GPX elevations" },
  };
}
