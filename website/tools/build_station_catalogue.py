"""Build data/india-stations.json from the station catalogues shipped with the
CBE Clima Tool (assets/data/one_building.csv and assets/data/epw_location.json).

Run from the repository root:  python3 website/tools/build_station_catalogue.py
"""
import csv
import gzip
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "website" / "data" / "india-stations.json"

# preferred order of files when a station has several
RANK = {"TMYx.2007-2021": 0, "TMYx.2004-2018": 1, "TMYx": 2, "ISHRAE2014": 3, "ISHRAE": 4, "IWEC": 5}


def label(kind):
    return {"TMYx.2007-2021": "TMYx 2007–2021", "TMYx.2004-2018": "TMYx 2004–2018", "TMYx": "TMYx (full record)",
            "ISHRAE2014": "ISHRAE 2014", "ISHRAE": "ISHRAE (EnergyPlus)", "IWEC": "IWEC (EnergyPlus)"}[kind]


def num(v):
    m = re.match(r"\s*(-?\d+(\.\d+)?)", v or "")
    return float(m.group(1)) if m else None


def main():
    stations = {}
    raw = (ROOT / "assets" / "data" / "one_building.csv").read_bytes()
    text = gzip.decompress(raw).decode("utf-8") if raw[:2] == b"\x1f\x8b" else raw.decode("utf-8")
    for r in csv.DictReader(io.StringIO(text)):
        if not r["name"].endswith(" IND"):
            continue
        url = re.search(r"href=(\S+?)[ >\"]", r["Source"]).group(1)
        fname = url.split("/")[-1]
        kind = re.sub(r"^.*?\.\d{6}_", "", fname)[:-4]
        if kind not in RANK:
            continue
        folder = url.split("/")[-2]  # e.g. JK_Jammu_and_Kashmir
        state = folder.split("_", 1)[1].replace("_", " ") if "_" in folder else ""
        wmo = re.search(r"\.(\d{6})_", fname)
        key = wmo.group(1) if wmo else fname
        name = re.sub(r"\s+[A-Z]{2}\s+IND$", "", r["name"]).replace(".", " ").strip()
        s = stations.setdefault(key, {
            "n": name, "st": state, "lat": float(r["lat"]), "lon": float(r["lon"]),
            "el": num(r["elevation (m)"]), "h99": num(r["99% Heating DB"]), "c1": num(r["1% Cooling DB "]), "f": [],
        })
        period = r["period"] if re.match(r"\d{4}", r["period"] or "") else ""
        s["f"].append([label(kind), url, period, RANK[kind]])

    geo = json.loads((ROOT / "assets" / "data" / "epw_location.json").read_text(encoding="utf-8"))
    for f in geo["features"]:
        p = f["properties"]
        if not p["title"].startswith("IND_"):
            continue
        url = re.search(r"href=(\S+?)>", p["all"]).group(1)
        kind = "ISHRAE" if "ISHRAE" in p["title"] else "IWEC"
        name = re.sub(r"\.\d+_(ISHRAE|IWEC)$", "", p["title"][4:]).replace(".", " ").replace("_", " ")
        lon, lat = f["geometry"]["coordinates"]
        # attach to the station with the same WMO number, else one within ~15 km, else create one
        wmo = re.search(r"\.(\d{6})_", p["title"])
        near = [wmo.group(1)] if wmo and wmo.group(1) in stations else \
            [k for k, s in stations.items() if abs(s["lat"] - lat) < 0.14 and abs(s["lon"] - lon) < 0.14]
        if near:
            stations[near[0]]["f"].append([label(kind), url, "", RANK[kind]])
        else:
            stations["E-" + p["title"]] = {"n": name, "st": "", "lat": lat, "lon": lon, "el": None, "h99": None,
                                          "c1": None, "f": [[label(kind), url, "", RANK[kind]]]}

    out = []
    for s in stations.values():
        seen, files = set(), []
        for f in sorted(s["f"], key=lambda x: x[3]):
            if f[1] in seen:
                continue
            seen.add(f[1])
            files.append(f[:3])
        s["f"] = files
        out.append(s)
    out.sort(key=lambda s: (s["st"], s["n"]))
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"{len(out)} stations, {sum(len(s['f']) for s in out)} files -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
