import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import postData from "../src/posts/posts.11tydata.js";

const read = (path) => readFile(new URL(`../_site/${path}`, import.meta.url), "utf8");

test("post renders the route explorer alongside all existing photos and GPX links", async () => {
  const html = await read("journal/gr20-in-7-days/index.html");
  assert.equal((html.match(/<figure\b/g) || []).length, 18);
  assert.equal((html.match(/data-day="\d"/g) || []).length, 8);
  assert.equal((html.match(/class="route-day-stats"/g) || []).length, 8);
  assert.match(html, /id="gr20-route"/);
  assert.match(html, /<h2 id="route-heading">Overview<\/h2>/);
  assert.doesNotMatch(html, /Seven days, on the map|From Conca to Calenzana, one day at a time\./);
  assert.match(html, /© IGN · RGE ALTI/);
  assert.match(html, /<h2>Arrival Logistics<\/h2>/);
  assert.match(html, /<h2>Day 7: Carozzu → Calenzana<\/h2>/);
  assert.doesNotMatch(html, /{%|{{|<pre><code>&lt;section/);
  assert.doesNotMatch(html, /<p><path|<p><button|<\/button><\/p>/);
  for (const path of ["assets/vendor/leaflet/leaflet.js", "assets/vendor/leaflet/leaflet.css", "assets/vendor/leaflet/LICENSE"]) {
    await access(new URL(`../_site/${path}`, import.meta.url));
  }
});

test("route JSON, static card figures, and downloadable files agree", async () => {
  const data = JSON.parse(await read("assets/gr20/route-data.json"));
  const html = await read("journal/gr20-in-7-days/index.html");
  assert.equal(data.days.length, 7);
  for (const day of data.days) {
    assert.ok(html.includes(`${day.distanceLabel} km <span>+${day.gainLabel} m`));
    await access(new URL(`../_site${day.gpx}`, import.meta.url));
  }
  assert.equal(data.totals.distanceLabel, (data.days.reduce((sum, day) => sum + day.distance, 0) / 1000).toFixed(1));
});

test("each hiking-day heading is immediately followed by its own map, without duplicate IDs", async () => {
  const html = await read("journal/gr20-in-7-days/index.html");
  assert.equal((html.match(/class="route-explorer route-explorer--daily"/g) || []).length, 7);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (let day = 1; day <= 7; day++) {
    assert.match(html, new RegExp(`<h2>Day ${day}: [^<]+</h2>\\s*<section class="route-explorer route-explorer--daily" id="gr20-day-${day}"`));
    assert.match(html, new RegExp(`id="route-map-day-${day}"`));
    assert.match(html, new RegExp(`id="elevation-profile-day-${day}"`));
    assert.match(html, new RegExp(`id="route-download-day-${day}"`));
  }
  assert.doesNotMatch(html, /id="gr20-day-0"/);
});

test("mapping libraries only load on the GR20 post; sitemap stays unchanged", async () => {
  for (const path of ["index.html", "journal/index.html", "manage/index.html"]) {
    assert.doesNotMatch(await read(path), /leaflet|route-map\.js/);
  }
  const sitemap = await read("sitemap.xml");
  assert.equal((sitemap.match(/<loc>/g) || []).length, 3);
  assert.doesNotMatch(sitemap, /route-data/);
});

test("post URLs omit dates while keeping the publication date and old-link redirect", async () => {
  const clean = "/journal/gr20-in-7-days/";
  const old = "/journal/2026-09-24-gr20-in-7-days/";
  assert.equal(postData.eleventyComputed.permalink({ page: { fileSlug: "gr20-in-7-days" } }), clean);
  assert.equal(postData.eleventyComputed.permalink({ page: { fileSlug: "another-post" } }), "/journal/another-post/");
  const html = await read("journal/gr20-in-7-days/index.html");
  assert.ok(html.includes(`rel="canonical" href="https://luke-yuan.github.io${clean}"`));
  assert.match(html, /<time datetime="2026-09-24">/);
  const journal = await read("journal/index.html");
  assert.ok(journal.includes(`href="${clean}"`));
  assert.ok(!journal.includes(`href="${old}"`));
  const sitemap = await read("sitemap.xml");
  assert.ok(sitemap.includes(clean));
  assert.ok(!sitemap.includes(old));
  const redirect = await read("journal/2026-09-24-gr20-in-7-days/index.html");
  assert.ok(redirect.includes(`rel="canonical" href="https://luke-yuan.github.io${clean}"`));
  assert.match(redirect, /window\.location\.search \+ window\.location\.hash/);
  assert.match(redirect, /<noscript><meta http-equiv="refresh"/);
  assert.doesNotMatch(redirect, /class="route-explorer"/);
});
