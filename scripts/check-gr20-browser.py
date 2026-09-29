"""Optional Playwright smoke test. Run against a local preview; OSM tiles are mocked."""
import argparse
import base64
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://localhost:8080")
args = parser.parse_args()
url = args.base_url.rstrip("/") + "/journal/gr20-in-7-days/"
output = Path(tempfile.mkdtemp(prefix="gr20-browser-"))
tile = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA8sAAAAASUVORK5CYII=")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    context = browser.new_context(viewport={"width": 1280, "height": 1050})
    context.route("https://tile.openstreetmap.org/**",
                  lambda route: route.fulfill(status=200, content_type="image/png", body=tile))
    page = context.new_page()
    errors = []
    data_requests = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: data_requests.append(request.url) if request.url.endswith("/route-data.json") else None)
    assert page.goto(url).status == 200
    assert page.locator(".route-explorer--daily .leaflet-container").count() == 0
    page.locator("#gr20-route").scroll_into_view_if_needed()
    page.wait_for_function("!document.querySelectorAll('[data-day]')[7].disabled")
    assert page.locator("#route-map").is_visible()
    assert not page.locator("#gr20-route .route-outline").is_visible()
    assert page.locator(".route-days > button").count() == 8
    assert page.locator("#elevation-profile path").count() == 14
    for day in range(1, 8):
        page.locator(f'[data-day="{day}"]').click()
        assert page.locator(f'[data-day="{day}"]').get_attribute("aria-pressed") == "true"
        assert page.locator('[data-day][aria-pressed="true"]').count() == 1
        assert page.locator("#route-selection").text_content().startswith(f"Day {day}")
        assert page.locator("#route-download").get_attribute("href").endswith(".gpx")
        assert page.locator("#elevation-profile path").count() == 2
        assert page.locator("#gr20-route .leaflet-marker-icon").count() == 2
    page.locator('[data-day="0"]').click()
    assert page.locator("#gr20-route .leaflet-marker-icon").count() == 8
    assert page.locator("#route-download").get_attribute("href").endswith(".zip")
    page.locator('[data-day="6"]').focus()
    page.keyboard.press("Enter")
    assert page.locator('[data-day="6"]').get_attribute("aria-pressed") == "true"
    page.locator("#elevation-profile").hover()
    assert "km" in page.locator("#profile-readout").inner_text()
    page.locator('[data-day="0"]').click()
    page.locator("#gr20-route .route-card").screenshot(path=str(output / "desktop.png"))
    for width in [320, 390, 768]:
        page.set_viewport_size({"width": width, "height": 844})
        page.reload()
        page.locator("#gr20-route").scroll_into_view_if_needed()
        page.wait_for_function("!document.querySelectorAll('[data-day]')[7].disabled")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), width
        page.locator('[data-day="6"]').click()
        if width == 390:
            page.locator("#gr20-route .route-card").screenshot(path=str(output / "mobile.png"))
            assert page.locator("#elevation-profile").evaluate("el => el.viewBox.baseVal.width < 400")
    assert not errors, errors
    print("PASS: seven days, reset, keyboard, profile hover, downloads, desktop/mobile; no JS errors")
    # Fresh navigation: seven independent maps must reuse a single route-data fetch.
    page.set_viewport_size({"width": 1280, "height": 1050})
    data_requests.clear()
    page.goto(url)
    page.locator("#gr20-route").scroll_into_view_if_needed()
    page.wait_for_function("document.querySelector('#gr20-route').dataset.routeReady === 'true'")
    page.locator('[data-day="6"]').click()
    for day in range(1, 8):
        daily = page.locator(f"#gr20-day-{day}")
        daily.scroll_into_view_if_needed()
        page.wait_for_function("(day) => document.querySelector('#gr20-day-' + day).dataset.routeReady === 'true'", arg=day)
        assert daily.locator(".route-map").is_visible()
        assert not daily.locator(".route-outline").is_visible()
        assert daily.locator(".elevation-profile path").count() == 2
        assert daily.locator(".leaflet-marker-icon").count() == 2
        assert daily.locator("[data-day]").count() == 0
        assert daily.locator(".route-kicker").text_content().startswith(f"Day {day}")
        assert daily.locator(f"#route-download-day-{day}").get_attribute("href").endswith(".gpx")
        assert daily.evaluate("(el) => el.previousElementSibling.tagName === 'H2'")
        daily.locator(".elevation-profile").hover()
        assert "km" in daily.locator(".profile-readout").inner_text()
        assert page.locator("#route-selection").text_content().startswith("Day 6")
        if day == 2:
            daily.screenshot(path=str(output / "day2-desktop.png"))
    assert len(data_requests) == 1, data_requests
    assert page.evaluate("(() => { const ids = Array.from(document.querySelectorAll('[id]'), el => el.id); return new Set(ids).size === ids.length; })()")
    page.set_viewport_size({"width": 390, "height": 844})
    page.locator("#gr20-day-2").scroll_into_view_if_needed()
    page.locator("#gr20-day-2").screenshot(path=str(output / "day2-mobile.png"))
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert not errors, errors
    print("PASS: seven separate lazy-loaded maps, heading placement, independent profiles, unique IDs, one shared data request")
    direct = context.new_page()
    direct.goto(url + "#gr20-day-5")
    direct.wait_for_function("document.querySelector('#gr20-day-5').dataset.routeReady === 'true'")
    assert direct.locator("#route-map-day-5").is_visible()
    assert direct.locator("#gr20-route").get_attribute("data-route-ready") is None
    assert direct.locator("#route-selection-day-5").text_content().startswith("Day 5")
    print("PASS: direct link to a daily map works without initializing the overview")
    legacy = context.new_page()
    legacy.goto(args.base_url.rstrip("/") + "/journal/2026-09-24-gr20-in-7-days/?source=old-link#gr20-day-5")
    legacy.wait_for_url(url + "?source=old-link#gr20-day-5")
    legacy.wait_for_function("document.querySelector('#gr20-day-5').dataset.routeReady === 'true'")
    assert legacy.locator("#route-map-day-5").is_visible()
    print("PASS: old dated URL forwards to the clean URL, preserving query and day anchor")
    context.close()

    context = browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.goto(url)
    assert page.locator("#gr20-route .route-outline").is_visible()
    assert page.locator("#gr20-route .route-outline path").count() == 7
    for day in range(1, 8):
        assert page.locator(f"#gr20-day-{day} .route-outline").is_visible()
        assert page.locator(f"#gr20-day-{day} .route-outline path").count() == 1
    assert page.locator(".route-day-stats").count() == 8
    assert not page.locator("#route-map-status").is_visible()
    page.goto(args.base_url.rstrip("/") + "/journal/2026-09-24-gr20-in-7-days/")
    page.wait_for_url(url)
    assert page.locator("h1").text_content() == "GR20 in 7 Days as an Outdoor Noob"
    print("PASS: no-JavaScript route outline, all daily figures and downloads")
    context.close()

    for failure in ["data", "leaflet", "tiles"]:
        context = browser.new_context(viewport={"width": 390, "height": 844})
        context.route("https://tile.openstreetmap.org/**", lambda route: route.abort())
        if failure == "data":
            context.route("**/assets/gr20/route-data.json", lambda route: route.abort())
        if failure == "leaflet":
            context.route("**/assets/vendor/leaflet/leaflet.js", lambda route: route.abort())
        page = context.new_page()
        page.goto(url)
        page.locator("#gr20-route").scroll_into_view_if_needed()
        page.wait_for_function('document.querySelector("#route-map-status").textContent.includes("could not load")')
        assert page.locator(".route-day-stats").count() == 8
        if failure in ["data", "leaflet"]:
            assert page.locator("#gr20-route .route-outline").is_visible()
        if failure == "leaflet":
            assert page.locator("#route-profile").is_visible()
            page.locator('[data-day="7"]').click()
            assert page.locator("#route-selection").text_content().startswith("Day 7")
        page.locator("#gr20-day-3").scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('#route-map-status-day-3').textContent.includes('could not load')")
        if failure in ["data", "leaflet"]:
            assert page.locator("#gr20-day-3 .route-outline").is_visible()
        if failure == "leaflet":
            assert page.locator("#gr20-day-3 .route-profile").is_visible()
        assert page.locator("#route-download-day-3").get_attribute("href").endswith(".gpx")
        print("PASS: fallback for", failure)
        context.close()
    browser.close()
print("Screenshots (mock basemap):", output)
