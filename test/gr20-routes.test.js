import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { distanceMeters, parseRoute, loadRoutes, metricLabels, withTerrainElevations } from "../scripts/gr20-routes.js";

const point = (lat, lon, elevation) => `<trkpt lat="${lat}" lon="${lon}"><ele>${elevation}</ele></trkpt>`;
const segment = (...points) => `<trkseg>${points.join("")}</trkseg>`;
const gpx = (...segments) => `<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk>${segments.join("")}</trk></gpx>`;
const close = (actual, expected, tolerance = 0.001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);

test("horizontal haversine distance: identity, symmetry, a degree at the equator", () => {
  assert.equal(distanceMeters([42, 9], [42, 9]), 0);
  close(distanceMeters([0, 0], [0, 1]), 111195.080234);
  close(distanceMeters([42, 9], [41, 8]), distanceMeters([41, 8], [42, 9]));
  assert.ok(Number.isFinite(distanceMeters([0, 0], [0, 180])));
});

test("gain sums climbs, not net elevation; descent is separate", () => {
  const route = parseRoute(gpx(segment(point(42, 9, 100), point(42.001, 9, 130), point(42.002, 9, 110), point(42.003, 9, 140))));
  close(route.distance, 333.58524);
  assert.equal(route.gain, 60);
  assert.equal(route.loss, 20);
  assert.equal(route.segments[0][3][3], Math.round(route.distance));
});

test("separate segments and tracks do not add fictitious connecting distances or climbs", () => {
  const a = segment(point(42, 9, 100), point(42.001, 9, 110));
  const b = segment(point(44, 9, 900), point(44.001, 9, 880));
  for (const xml of [gpx(a, b), `<gpx><trk>${a}</trk><trk>${b}</trk></gpx>`]) {
    const route = parseRoute(xml);
    close(route.distance, 222.39016);
    assert.equal(route.gain, 10);
    assert.equal(route.loss, 20);
    assert.equal(route.segments[1][0][3], route.segments[0].at(-1)[3]);
  }
});

test("prefixed GPX namespaces and repeated points are accepted", () => {
  const xml = gpx(segment(point(42, 9, 100), point(42, 9, 100), point(42.001, 9, 110)));
  const route = parseRoute(xml.replace(/<(\/?)(gpx|trk|trkseg|trkpt|ele)\b/g, "<$1g:$2").replace("xmlns=", "xmlns:g="));
  assert.equal(route.gain, 10);
  close(route.distance, 111.19508);
});

test("bad geometry and missing elevation fail the build instead of yielding invented stats", () => {
  const valid = point(42.001, 9, 110);
  for (const bad of [
    point("oops", 9, 100), point(91, 9, 100), point(42, 181, 100),
    point(42, 9, "NaN"), point(42, 9, ""), point("", 9, 100),
    '<trkpt lat="42" lon="9"/>',
  ]) assert.throws(() => parseRoute(gpx(segment(bad, valid))), /valid coordinates and elevation/);
  assert.throws(() => parseRoute("<gpx><trk>"), /invalid/);
  assert.throws(() => parseRoute("<!DOCTYPE gpx><gpx/>"), /unsupported/);
  assert.throws(() => parseRoute("<gpx/>"), /track segments/);
  assert.throws(() => parseRoute(gpx(segment(valid))), /at least two/);
  assert.throws(() => parseRoute(gpx(segment(valid, valid))), /nonzero distance/);
});

test("metrics are rounded only for display", () => {
  assert.deepEqual(metricLabels({ distance: 28345.6, gain: 2917.4 }), { distanceLabel: "28.3", gainLabel: "2,920" });
});

test("all seven real routes match independently calculated GPX results", async () => {
  const { days, totals } = await loadRoutes({ elevationSource: "gpx" });
  const expected = [
    ["28.3", 2917], ["31.6", 2172], ["31.4", 1834], ["20.0", 2208],
    ["33.2", 2335], ["19.5", 2190], ["18.2", 1553],
  ];
  assert.equal(days.length, 7);
  for (const [i, day] of days.entries()) {
    assert.equal(day.day, i + 1);
    assert.equal(day.distanceLabel, expected[i][0]);
    assert.equal(Math.round(day.gain), expected[i][1]);
    assert.ok(day.overviewPath.startsWith("M"));
    assert.ok(!day.overviewPath.includes("NaN"));
    assert.equal(day.outline.paths.length, 1);
    assert.ok(day.outline.paths[0].startsWith("M"));
    assert.notEqual(day.outline.paths[0], day.overviewPath);
    if (i) assert.deepEqual(days[i - 1].segments.at(-1).at(-1).slice(0, 3), day.segments[0][0].slice(0, 3));
  }
  close(totals.distance, days.reduce((sum, day) => sum + day.distance, 0));
  close(totals.gain, days.reduce((sum, day) => sum + day.gain, 0));
});

test("terrain elevations replace GPX heights without changing the route or connecting segments", () => {
  const xml = gpx(
    segment(point(42, 9, 10), point(42.001, 9, 20)),
    segment(point(44, 9, 100), point(44.001, 9, 110)),
  );
  const original = parseRoute(xml);
  const cached = { gpxSha256: createHash("sha256").update(xml).digest("hex"), elevations: [100, 130, 900, 880] };
  const terrain = withTerrainElevations(original, cached, xml);
  assert.equal(terrain.gain, 30);
  assert.equal(terrain.loss, 20);
  assert.equal(terrain.distance, original.distance);
  assert.equal(terrain.segments[1][0][2], 900);
  assert.throws(() => withTerrainElevations(original, { ...cached, gpxSha256: "stale" }, xml), /missing or stale/);
  assert.throws(() => withTerrainElevations(original, { ...cached, elevations: [1, 2] }, xml), /incomplete/);
  assert.throws(() => withTerrainElevations(original, { ...cached, elevations: [1, 2, -99999, 4] }, xml), /invalid/);
});

test("all seven cached IGN routes are reproducible and source-labelled", async () => {
  const terrain = await loadRoutes();
  const gpx = await loadRoutes({ elevationSource: "gpx" });
  assert.equal(terrain.source.name, "IGN RGE ALTI");
  assert.equal(terrain.source.resource, "ign_rge_alti_wld");
  assert.match(terrain.source.retrievedDate, /^\d{4}-\d{2}-\d{2}$/);
  for (const [i, day] of terrain.days.entries()) {
    assert.equal(day.distance, gpx.days[i].distance);
    assert.ok(day.gain > 0);
    assert.notEqual(day.gain, gpx.days[i].gain);
    assert.equal(day.segments.flat().length, gpx.days[i].segments.flat().length);
  }
});
