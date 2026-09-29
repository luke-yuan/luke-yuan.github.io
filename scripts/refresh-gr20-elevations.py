#!/usr/bin/env python3
"""Cache IGN RGE ALTI elevations at the public GPX vertices; never runs in a build."""
import hashlib
import json
from pathlib import Path
import time
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/gr20-ign-elevations.json"
ENDPOINT = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json"
RESOURCE = "ign_rge_alti_wld"


def request_json(parameters):
    url = ENDPOINT + "?" + urllib.parse.urlencode(parameters)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))


def refresh():
    cached = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {
        "source": {
            "name": "IGN RGE ALTI",
            "resource": RESOURCE,
            "endpoint": ENDPOINT,
            "metadataUrl": "https://data.geopf.fr/altimetrie/resources/" + RESOURCE,
            "documentationUrl": "https://geoservices.ign.fr/documentation/services/api-et-services-ogc/calcul-altimetrique-rest",
            "method": "Terrain elevations at original GPX track vertices; no resampling or smoothing.",
        },
        "routes": {},
    }
    OUTPUT.parent.mkdir(exist_ok=True)
    for path in sorted((ROOT / "src/assets/gr20/routes").glob("*.gpx")):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if cached["routes"].get(path.name, {}).get("gpxSha256") == digest:
            print(path.name, "cached", flush=True)
            continue
        points = ET.parse(path).findall(".//{*}trkpt")
        elevations = []
        source_names = set()
        for offset in range(0, len(points), 100):
            batch = points[offset:offset + 100]
            result = request_json({
                "resource": RESOURCE, "measures": "true",
                "lon": "|".join(point.get("lon") for point in batch),
                "lat": "|".join(point.get("lat") for point in batch),
            })
            values = result.get("elevations", [])
            if len(values) != len(batch):
                raise ValueError(f"{path.name}: incomplete IGN response")
            for point, value in zip(batch, values):
                elevation = value.get("z")
                if (not isinstance(elevation, (float, int)) or not -100 < elevation < 9000
                        or abs(value["lat"] - float(point.get("lat"))) > 0.000001
                        or abs(value["lon"] - float(point.get("lon"))) > 0.000001):
                    raise ValueError(f"{path.name}: invalid or mismatched IGN elevation")
                elevations.append(elevation)
                source_names.update(measure.get("source_name", "") for measure in value.get("measures", []))
            print(f"{path.name}: {len(elevations)}/{len(points)}", flush=True)
            time.sleep(0.25)
        cached["routes"][path.name] = {
            "gpxSha256": digest,
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "sources": sorted(source_names),
            "elevations": elevations,
        }
        temporary = OUTPUT.with_suffix(".tmp")
        temporary.write_text(json.dumps(cached, ensure_ascii=False, separators=(",", ":")) + "\n")
        temporary.replace(OUTPUT)
        gain = sum(max(0, b - a) for a, b in zip(elevations, elevations[1:]))
        print(f"Saved {path.name}: IGN gain {gain:.0f} m", flush=True)


if __name__ == "__main__":
    refresh()
