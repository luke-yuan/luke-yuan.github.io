(() => {
  const roots = document.querySelectorAll(".route-explorer");
  if (!roots.length) return;
  let dataPromise;
  function loadData() {
    // All eight maps share one data request; each has independent map/profile state.
    return dataPromise ??= fetch("/assets/gr20/route-data.json").then((response) => {
      if (!response.ok) throw new Error("Route data unavailable");
      return response.json();
    });
  }
  const svgNS = "http://www.w3.org/2000/svg";
  const svgElement = (tag, attributes = {}, text) => {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text !== undefined) element.textContent = text;
    return element;
  };

  function initialize(root) {
    const initialDay = Number(root.dataset.routeDay || 0);
    const suffix = initialDay ? `-day-${initialDay}` : "";
    const get = (id) => root.querySelector(`#${id}${suffix}`);
    const status = get("route-map-status");

    async function start() {
      status.hidden = false;
      const { days: allDays, totals } = await loadData();
      const days = initialDay ? allDays.filter((day) => day.day === initialDay) : allDays;
      const L = window.L;
      let map, markerGroup, hoverMarker;
      const layers = [];
      if (L) {
        get("route-map").hidden = false;
        map = L.map(get("route-map"), { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomSnap: 0.25, zoomDelta: 0.5 });
        const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        let tileFailures = 0;
        tiles.on("tileerror", () => {
          tileFailures += 1;
          status.hidden = false;
          status.textContent = "Some background map tiles could not load. Your GPX routes and estimates are still available.";
        });
        tiles.on("loading", () => { tileFailures = 0; });
        tiles.on("load", () => { if (!tileFailures) status.hidden = true; });
        for (const day of days) {
          const coordinates = day.segments.map((segment) => segment.map(([lat, lon]) => [lat, lon]));
          const halo = L.polyline(coordinates, { color: "#fffefa", weight: 7, opacity: 0.9, interactive: false }).addTo(map);
          const line = L.polyline(coordinates, { color: day.color, weight: 3.5, opacity: 1 }).addTo(map);
          line.bindTooltip(`Day ${day.day}: ${day.from} → ${day.to} · ${day.distanceLabel} km · +${day.gainLabel} m`);
          line.on("click", () => selectDay(day.day));
          layers.push({ day, line, halo });
        }
        markerGroup = L.layerGroup().addTo(map);
        hoverMarker = L.circleMarker([0, 0], { radius: 5, color: "#292d29", weight: 2, fillColor: "#fffefa", fillOpacity: 1, interactive: false });
        root.querySelector(".route-outline").setAttribute("hidden", "");
        status.hidden = true;
      } else {
        status.textContent = "The interactive basemap could not load. You can still explore daily estimates and elevation profiles below.";
      }

      const profile = get("elevation-profile");
      let profilePoints = [], profileDistance = 0, cursor, profileDot, selectedDay = initialDay, profileWidth = 640;
      const plot = { left: 42, right: 624, top: 18, bottom: 136 };
      let elevationTop = 3000;
      const x = (distance) => plot.left + distance / profileDistance * (plot.right - plot.left);
      const y = (elevation) => plot.bottom - elevation / elevationTop * (plot.bottom - plot.top);

      function drawProfile(selected) {
        get("route-profile").hidden = false;
        // Keep axis labels legible on phones instead of scaling a desktop chart down.
        profileWidth = Math.max(240, Math.min(640, Math.round(profile.clientWidth)));
        plot.right = profileWidth - 16;
        profile.setAttribute("viewBox", `0 0 ${profileWidth} 170`);
        profile.setAttribute("aria-labelledby", `profile-title${suffix} profile-description${suffix}`);
        profile.replaceChildren();
        profilePoints = [];
        profileDistance = selected.reduce((sum, day) => sum + day.distance, 0);
        elevationTop = Math.ceil(Math.max(...selected.flatMap((day) => day.segments.flat().map((point) => point[2]))) / 500) * 500;
        profile.append(
          svgElement("title", { id: `profile-title${suffix}` }, selected.length === 1 ? `Day ${selected[0].day} elevation profile` : "Seven-day elevation profile"),
          svgElement("desc", { id: `profile-description${suffix}` }, `Elevation in meters over ${(profileDistance / 1000).toFixed(1)} kilometers. Each day's route is drawn in its matching color.`),
        );
        for (let i = 0; i <= 3; i++) {
          const elevation = elevationTop * i / 3;
          profile.append(
            svgElement("line", { x1: plot.left, x2: plot.right, y1: y(elevation), y2: y(elevation), class: "profile-grid" }),
            svgElement("text", { x: plot.left - 7, y: y(elevation) + 3, "text-anchor": "end" }, Math.round(elevation).toLocaleString("en-US")),
            svgElement("text", { x: x(profileDistance * i / 3), y: 158, "text-anchor": i === 0 ? "start" : i === 3 ? "end" : "middle" }, `${(profileDistance * i / 3 / 1000).toFixed(1)} km`),
          );
        }
        let offset = 0;
        for (const day of selected) {
          for (const segment of day.segments) {
            const samples = segment.map((point) => ({ point, distance: offset + point[3], day: day.day }));
            profilePoints.push(...samples);
            const path = samples.map(({ point, distance }, i) => `${i ? "L" : "M"}${x(distance).toFixed(2)},${y(point[2]).toFixed(2)}`).join(" ");
            const area = `${path} L${x(samples.at(-1).distance)},${plot.bottom} L${x(samples[0].distance)},${plot.bottom} Z`;
            profile.append(
              svgElement("path", { d: area, fill: day.color, opacity: 0.12 }),
              svgElement("path", { d: path, fill: "none", stroke: day.color, "stroke-width": 1.7, "stroke-linejoin": "round" }),
            );
          }
          offset += day.distance;
        }
        cursor = svgElement("line", { y1: plot.top, y2: plot.bottom, class: "profile-cursor", visibility: "hidden" });
        profileDot = svgElement("circle", { r: 3.5, fill: "#fffefa", stroke: "#292d29", "stroke-width": 1.5, visibility: "hidden" });
        profile.append(cursor, profileDot);
        clearHover();
      }

      function addStop(point, label, number, color) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="route-stop" style="--day-color:${color}">${number}</span>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        });
        L.marker(point.slice(0, 2), { icon, title: label, alt: label, keyboard: true })
          .bindTooltip(label).addTo(markerGroup);
      }

      function selectDay(number) {
        selectedDay = number;
        const selected = number ? days.filter((day) => day.day === number) : days;
        const metrics = number ? selected[0] : totals;
        get("route-selection").textContent = number ? `Day ${number} · South → North` : "All seven days · South → North";
        get("route-title").textContent = `${selected[0].from} → ${selected.at(-1).to}`;
        get("route-distance").textContent = metrics.distanceLabel;
        get("route-gain").textContent = metrics.gainLabel;
        const link = get("route-download");
        link.href = number ? selected[0].gpx : "/assets/gr20/gr20-seven-day-routes.zip";
        link.textContent = number ? `Download Day ${number} GPX` : "Download all seven GPX routes";
        for (const button of root.querySelectorAll("[data-day]")) {
          button.setAttribute("aria-pressed", String(Number(button.dataset.day) === number));
        }
        if (map) {
          // Set a view before reordering paths: Leaflet creates their SVG nodes on first load.
          map.fitBounds(L.latLngBounds(selected.flatMap((day) => day.segments.flat().map((point) => point.slice(0, 2)))), { padding: [32, 32], animate: false });
          markerGroup.clearLayers();
          for (const { day, line, halo } of layers) {
            const active = !number || day.day === number;
            line.setStyle({ opacity: active ? 1 : 0.16, weight: active ? 3.5 : 2 });
            halo.setStyle({ opacity: active ? 0.9 : 0 });
            if (active) { halo.bringToFront(); line.bringToFront(); }
          }
          addStop(selected[0].segments[0][0], selected[0].from, "S", selected[0].color);
          for (const day of selected) addStop(day.segments.at(-1).at(-1), day.to, number ? "F" : day.day, day.color);
          if (hoverMarker) hoverMarker.remove();
        }
        drawProfile(selected);
      }

      function clearHover() {
        if (cursor) cursor.setAttribute("visibility", "hidden");
        if (profileDot) profileDot.setAttribute("visibility", "hidden");
        if (hoverMarker) hoverMarker.remove();
        get("profile-readout").textContent = "Move over the profile to explore";
      }
      profile.addEventListener("pointermove", (event) => {
        const bounds = profile.getBoundingClientRect();
        const px = (event.clientX - bounds.left) / bounds.width * profileWidth;
        if (px < plot.left || px > plot.right) { clearHover(); return; }
        const target = (px - plot.left) / (plot.right - plot.left) * profileDistance;
        const nearest = profilePoints.reduce((best, sample) => Math.abs(sample.distance - target) < Math.abs(best.distance - target) ? sample : best);
        cursor.setAttribute("x1", x(nearest.distance));
        cursor.setAttribute("x2", x(nearest.distance));
        cursor.setAttribute("visibility", "visible");
        profileDot.setAttribute("cx", x(nearest.distance));
        profileDot.setAttribute("cy", y(nearest.point[2]));
        profileDot.setAttribute("visibility", "visible");
        get("profile-readout").textContent = `${selectedDay ? "" : `Day ${nearest.day} · `}${(nearest.distance / 1000).toFixed(1)} km · ${Math.round(nearest.point[2]).toLocaleString("en-US")} m`;
        if (map) hoverMarker.setLatLng(nearest.point.slice(0, 2)).addTo(map);
      });
      profile.addEventListener("pointerleave", clearHover);
      for (const button of root.querySelectorAll("[data-day]")) {
        button.disabled = false;
        button.addEventListener("click", () => selectDay(Number(button.dataset.day)));
      }
      selectDay(initialDay);
      if (window.ResizeObserver) {
        new ResizeObserver(() => {
          const width = Math.max(240, Math.min(640, Math.round(profile.clientWidth)));
          if (width !== profileWidth) drawProfile(selectedDay ? days.filter((day) => day.day === selectedDay) : days);
        }).observe(profile);
      }
    }

    start().then(() => { root.dataset.routeReady = "true"; }).catch((error) => {
      console.error("GR20 route explorer:", error);
      get("route-map").hidden = true;
      get("route-profile").hidden = true;
      for (const button of root.querySelectorAll("[data-day]")) button.disabled = true;
      root.querySelector(".route-outline").removeAttribute("hidden");
      status.hidden = false;
      status.textContent = "The interactive view could not load. The route outline, daily estimates and GPX downloads are still available.";
      root.dataset.routeReady = "error";
    });
  }

  // Do not load seven off-screen basemaps. Start each map only when a reader reaches it.
  if (window.IntersectionObserver) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        initialize(entry.target);
      }
    });
    for (const root of roots) observer.observe(root);
  } else {
    for (const root of roots) initialize(root);
  }
})();
