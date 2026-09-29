# Luke's notebook

A small personal site for thoughts and travel, hosted at <https://luke-yuan.github.io>.
Eleventy turns Markdown into static HTML. GitHub Actions publishes each change to `master`.

## Write, edit, or delete

Open <https://luke-yuan.github.io/manage/> and sign in to GitHub when prompted.

- **New post:** choose a dated filename such as `2026-09-22-a-small-note.md`,
  edit the title and body, and commit directly to `master`.
- **Edit About:** update the text in `src/index.md` and commit.
- **Edit / Delete:** choose the action next to a published note and commit the change in GitHub.

The site updates after the **Publish site** workflow succeeds, usually within a few minutes.
The Manage page is public, but GitHub requires repository write access to publish or delete.
Deleting a post removes it from the current website; it stays in the repository's Git history.

## Post format

Create posts inside `src/posts/`. Use real dates in `YYYY-MM-DD-short-title.md` filenames;
the filename supplies the date. Notes are listed newest first.

```markdown
---
title: A small note
---

Something I want to remember.

## A heading

You can use **bold**, *italics*, and [links](https://example.com).
```

Keep titles on one line. Quote a title if it contains a colon, for example
`title: "Tokyo: day one"`. Use unique filenames. Everything in `src/posts/` is public;
keep unfinished drafts outside that folder.

For a photo, use **Upload photos** on the Manage page to upload it to `src/assets/`,
then include `![Description](/assets/photo.jpg)` in a post. JPG, PNG, GIF, and WebP
work. Use filenames without spaces and resize large photos before uploading.
Images automatically fit the page on phones and larger screens.

## Profile photo, blurb, and socials

Choose **Edit About** on the Manage page. All profile content lives in `src/index.md`:

- Upload a photo using **Upload photos**, then set `photo: /assets/profile.jpg`.
  The photo appears in a circular crop. Leave `photo: ""` to show your initials.
- Set `photo_alt` to a short description of the photo and `initials` to your initials.
- Edit the paragraphs below the second `---` line to change your blurb.
- Add social links under `socials`, using a label and full URL for each:

```yaml
socials:
  - label: LinkedIn
    url: https://www.linkedin.com/in/your-profile/
  - label: Strava
    url: https://www.strava.com/athletes/your-id
```

Leave a URL blank (`url: ""`) to show its logo in a muted state until you add the
link, or use `socials: []` to hide the social links. The `name` field in
`src/_data/site.json` is used in browser-tab titles and is not shown in the header.

## Local preview

Install Node.js 22 or newer, then:

```sh
npm ci
npm run dev
```

Open <http://localhost:8080>. Run `npm run build` to generate `_site/`.
The preview watches edits. After deleting a post locally, restart the preview with
`npm run build` or `npm run dev` to clear old output. Deployments always use a fresh build.

## Hosting

In the repository's **Settings → Pages**, set the source to **GitHub Actions**.
The workflow in `.github/workflows/pages.yml` publishes the site automatically.
Check the repository's **Actions** tab if an update does not appear.

Site name and repository links live in `src/_data/site.json`. Page styles live in
`src/assets/style.css`. This configuration serves from the root of `luke-yuan.github.io`.

## Search engines

`/sitemap.xml` is generated on every build and includes About, Journal, and all
published posts. Adding or deleting a post updates the sitemap automatically.
Manage, the 404 page, and the Google verification file are not included.
`/robots.txt` allows crawling and points search engines to the sitemap.

In Google Search Console, select the site's URL-prefix property, open **Sitemaps**,
and submit `sitemap.xml`. The public site URL is configured in `src/_data/site.json`.
Keep the Google verification file in `verification/`; it is copied unchanged to
the site root on every build.

## GR20 route explorer

The GR20 post embeds `src/_includes/gr20-map.njk` after Preparation. The
tabbed overview is preserved, with a separate `gr20-day-map.njk` immediately
after each Day 1–7 heading. Each daily map is fixed to its own route and has an
independent elevation profile, distance/D+, and GPX link. Maps initialize only
when scrolled into view and share a single route-data request. Each also has a
day-specific static outline for readers without JavaScript.
The `routeMap: gr20` front matter loads the locally hosted Leaflet library and the
explorer's CSS/JS only on that post. `templateEngineOverride: njk,md` allows the
include in Markdown.

Every build reads the seven files in `src/assets/gr20/routes/` using
`scripts/gr20-routes.js`. This generates the static daily cards, a no-JavaScript
route outline, and `/assets/gr20/route-data.json`. Selecting a day highlights its
route and updates its distance, elevation gain, profile, and GPX download link.
The map uses OpenStreetMap's standard tiles with visible attribution; there is
no API key, analytics, tile prefetch, or offline tile download.

These are **route estimates, not recorded activity totals or official published
stage totals**. Distance sums horizontal haversine distances along the GPX.
Elevation profiles and D+ use IGN RGE ALTI terrain elevations sampled at each
original GPX vertex, cached in `data/gr20-ign-elevations.json`. D+ sums positive
elevation differences without smoothing and is displayed to the nearest 10 m.
Separate tracks/segments are not joined. The source, retrieval date, and method
are disclosed in the widget. Terrain-model and track-spacing errors can affect
totals in either direction; no upward correction is applied.

To refresh elevations after replacing a GPX, run
`python3 scripts/refresh-gr20-elevations.py` (Python standard library only).
It calls the public IGN elevation API in batches, validates returned coordinates
and heights, and caches each completed day with a SHA-256 of the GPX. Unchanged
routes are reused; to refetch one, remove its entry from the cache. A build never
calls IGN or silently falls back to GPX elevations: missing, incomplete, or stale
cached terrain data fails the build. Keep filenames or update the list in
`scripts/gr20-routes.js`.

Run `npm test` for the build, GPX calculation tests, and static-page regression
checks. For a browser check, select each day, reset to Full route, hover the
profile, and try keyboard and mobile layouts. The outline, daily figures, and
downloads should remain usable without JavaScript. Mock tile requests in
automated browser tests rather than repeatedly fetching community-hosted tiles.
An optional smoke test is included for a Python environment with Playwright and
Chromium installed: start the preview, then run
`python3 scripts/check-gr20-browser.py --base-url http://localhost:8080`.
It mocks all tile requests and checks day selection, profiles, keyboard/mobile
layouts, no-JavaScript rendering, and network-failure fallbacks.
