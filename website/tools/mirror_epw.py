"""Mirror the weather files of the Indian station catalogue onto the website.

Climate.OneBuilding.org and the EnergyPlus S3 bucket do not send CORS headers, so a
browser cannot download their files directly. Without the optional Cloud Function
proxy (Blaze plan), the deploy workflows run this script so every file in
data/india-stations.json is served from the site itself as epw/<original name>.zip.

Each archive is repacked to hold only the .epw (deflated), roughly 0.4 MB per station.
Files already present are kept, so a cached epw/ folder makes re-runs cheap.
epw/index.json lists the mirrored names; the browser only uses the mirror for those.

Usage: python3 website/tools/mirror_epw.py [--limit N] [--workers 6]
Standard library only.
"""

import argparse
import io
import json
import os
import sys
import threading
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
HOSTS = {
    "climate.onebuilding.org",
    "energyplus-weather.s3.amazonaws.com",
    "energyplus.net",
    "www.energyplus.net",
}
UA = "ClimateVastuStudio-mirror/1.0 (+https://climate-and-vastu-studio.web.app)"


def mirror_name(url):
    return os.path.basename(urlparse(url).path)


def repack(data):
    """Return a zip holding only the .epw from a weather archive (or a bare .epw)."""
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".epw")]
            if not names:
                raise ValueError("no .epw in archive")
            name, epw = os.path.basename(names[0]), z.read(names[0])
    else:
        name, epw = "weather.epw", data
    if not epw.lstrip(b"\xef\xbb\xbf").startswith(b"LOCATION"):
        raise ValueError("not an EPW file")
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr(name, epw)
    return out.getvalue()


def valid(path):
    try:
        with zipfile.ZipFile(path) as z:
            return (
                any(n.lower().endswith(".epw") for n in z.namelist())
                and z.testzip() is None
            )
    except (OSError, zipfile.BadZipFile):
        return False


def fetch(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception:  # network errors and HTTP 5xx: retry with back-off
            if attempt == tries - 1:
                raise
            time.sleep(2 ** (attempt + 1))


def mirror_one(url, out_dir):
    path = os.path.join(out_dir, mirror_name(url))
    if os.path.exists(path) and valid(path):
        return "kept"
    data = repack(fetch(url))
    tmp = path + ".part"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)
    return "new"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument(
        "--catalogue", default=os.path.join(SITE, "data", "india-stations.json")
    )
    ap.add_argument("--out", default=os.path.join(SITE, "epw"))
    ap.add_argument(
        "--limit", type=int, default=0, help="mirror only the first N files (testing)"
    )
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    with open(args.catalogue, encoding="utf-8") as f:
        stations = json.load(f)
    urls, seen = [], {}
    for s in stations:
        for _label, url, *_ in s["f"]:
            if urlparse(url).hostname not in HOSTS:
                continue
            name = mirror_name(url)
            if name in seen and seen[name] != url:
                sys.exit("Two catalogue files share the name " + name)
            if name not in seen:
                seen[name] = url
                urls.append(url)
    if args.limit:
        urls = urls[: args.limit]
    os.makedirs(args.out, exist_ok=True)

    counts, failed, lock = {"kept": 0, "new": 0}, [], threading.Lock()

    def run(url):
        try:
            result = mirror_one(url, args.out)
            with lock:
                counts[result] += 1
        except (
            Exception
        ) as e:  # keep going; the site falls back to "download it yourself"
            with lock:
                failed.append((url, str(e)))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(run, urls))

    wanted = {mirror_name(u) for u in urls}
    present = sorted(
        n
        for n in os.listdir(args.out)
        if n in wanted and valid(os.path.join(args.out, n))
    )
    with open(os.path.join(args.out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(present, f, separators=(",", ":"))
    size = sum(os.path.getsize(os.path.join(args.out, n)) for n in present)
    print(
        f"Mirrored {len(present)}/{len(urls)} weather files ({counts['new']} downloaded, {counts['kept']} cached), {size / 1e6:.0f} MB"
    )
    for url, err in failed[:20]:
        print(f"  failed: {url}: {err}")
    if not present:
        sys.exit("No weather files could be mirrored.")


if __name__ == "__main__":
    main()
