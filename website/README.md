# Climate & Vastu Studio — trikrt

A climate-analysis, comfort and **Vastu × Science** planning website for Indian buildings, by **trikrt**
(Tejas P R, BE, MS — Chartered Structural Engineer, Mysore). It is a browser-first edition of the open-source
[CBE Clima Tool](https://github.com/CenterForTheBuiltEnvironment/clima), hosted on **Firebase**: static files on
Firebase Hosting, plus one Cloud Function in Mumbai (`asia-south1`) that fetches weather files for the browser.

## Brand settings

All company details live in **`js/config.js`**: name, wordmarks, tagline, phone, email, website, address, services and colours.

Brand assets are in `img/`: `trikrt-wordmark.svg` (forest), `trikrt-wordmark-white.svg` (on photos and the footer), `trikrt-mark.svg` (square icon: the logo's macron, stem and ring), `favicon-32.png`, `apple-touch-icon.png`, `og-image.jpg` (link previews) and `forest.jpg` (hero photo). The wordmark is drawn as vector outlines from Outfit (SIL Open Font License) with the macron and ring added, to match the trikrt banner. Colours: forest `#173a2a`, green `#2f7d4f`, moss `#b9dc8c`, mist `#f4f6f2`, sunlight `#e0952c` (selection on the plan only).

## Tools

| Page | What it does |
| --- | --- |
| Home & choose location | Search 405 Indian weather stations (Climate.OneBuilding.org TMYx, ISHRAE, IWEC) by city, district or state, or use "Near me", then load one with a click. You can also upload an EPW/ZIP or paste a link |
| **Vastu × Science planner** | A full-screen design studio. A start screen asks three questions (house type, plot size, road facing) and places every room using the trikrt Vastu wheel and the site's real sun, heat and breeze; you can also trace an uploaded plan drawing or start from a blank plot. Tabs for Plot, Rooms, Climate and Report sit beside a zoomable, pannable drawing (scroll / pinch to zoom, drag to pan). Tap a room for its inspector: why it scores as it does, a one-tap "move to its best spot", size steppers, rotate / duplicate / delete. Rooms can be added with + or dragged onto the plan. The Climate tab draws chajja depths, wall and window materials, breeze inlets/outlets and planting on the plan. Plans are named, saved on the device, shareable by link, and print as a report. On phones the panel is a bottom sheet with bottom tabs |
| Climate summary | Location details, headline numbers, a monthly table, heating/cooling degree days, monthly box plots and CSV export |
| Temperature & humidity | Annual band chart with IMAC (NV/MM) or ASHRAE 55 adaptive bands, daily profiles, heatmap and statistics |
| Sun & clouds | Polar and Cartesian sun paths coloured by any variable, monthly radiation profiles, sky cover and heatmaps |
| Wind | Annual wind rose, roses for the IMD seasons and times of day, a custom rose, and speed/direction heatmaps |
| Psychrometric chart | Every hour plotted with filters, colour-by and an editable comfort zone |
| Data explorer | Any variable as a profile or heatmap, filtered heatmaps and two-variable scatter |
| Climate zone & IMAC comfort | NBC 2016 / ECBC climate-zone classification computed from the file, and the India Model for Adaptive Comfort |
| Design strategy advisor | Tests passive strategies hour by hour and ranks them, plus façade sun loads and the prevailing breeze in each season |
| Natural ventilation | Hours suitable for natural ventilation, using either the IMAC band or a fixed range, with a dew-point limit |
| Outdoor comfort & heat stress | UTCI for four sun/shade/wind scenarios, heat index, and counts of hot days and warm nights |
| Shading designer | Sizes chajjas and fins from the site's sun positions, with a shadow-angle chart and the share of solar gain blocked |
| Envelope & ENS calculator | Layered wall and roof U-values from Indian materials, plus the Eco-Niwas Samhita 2018 RETV, roof U-value and openability checks |

## Run locally

```bash
node firebase/dev-server.js 8080      # site + weather-file proxy, no Firebase CLI needed
# or, with the Firebase CLI:
npm install --prefix firebase/functions
firebase emulators:start --only hosting,functions --project demo-climate-vastu
```

## Deploy to Firebase (project `climate-and-vastu-studio`)

### Automatic deploys with GitHub Actions

| Workflow | When | What |
| --- | --- | --- |
| `website.yml` | every push to other branches | Runs all tests |
| `firebase-hosting-pull-request.yml` | every pull request | Tests, then a 7-day **preview URL** posted as a PR comment |
| `firebase-hosting-merge.yml` | every merge to `main` | Tests, then deploys the **live** site to `climate-and-vastu-studio.web.app` (and the Cloud Function if enabled) |

**One-time setup:**

1. Create the service-account secret. The easiest way is to run these commands on your computer:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init hosting:github      # pick repo teja5zz/clima; say No to overwriting the workflow files
   ```

   This creates a Google service account and stores its key as the repository secret
   **`FIREBASE_SERVICE_ACCOUNT_CLIMATE_AND_VASTU_STUDIO`**. If the CLI rewrites the workflow files anyway, run
   `git checkout .github/workflows` to restore the ones in this repo.

   *Manual alternative:* in Google Cloud Console → IAM → Service accounts, create a key for a service account
   with the **Firebase Hosting Admin** role. Paste the JSON into GitHub → Settings → Secrets and variables →
   Actions → New repository secret, using the name above.

2. Optional, for one-click station loading: upgrade the Firebase project to the **Blaze** plan, which Cloud Functions
   require. Normal traffic stays within the free quota. Then:
   - Give the same service account the **Cloud Functions Admin**, **Cloud Run Admin**, **Service Account User** and
     **Artifact Registry Administrator** roles. If a deploy reports a missing permission, add the role it names.
   - Add the repository **variable** `DEPLOY_FUNCTIONS` = `true` (Settings → Secrets and variables → Actions → Variables).

   This step is not needed for one-click loading: the deploy workflows copy every station's weather file onto
   Hosting (see below). The function only adds a fallback for files that could not be mirrored.

3. Merge the website branch into `main`. The live site appears at <https://climate-and-vastu-studio.web.app>.
   You can also add `tools.tejas-constructions.in` under Firebase → Hosting → Add custom domain.

### Manual deploy

```bash
firebase login
npm install --prefix firebase/functions
firebase deploy --only hosting,functions      # Blaze plan
firebase deploy --only hosting                # Spark plan: first remove "rewrites" from firebase.json
```

### Analytics

`js/config.js` holds the Firebase web-app config, which is public by design. Google Analytics for Firebase only loads
after a visitor presses **Allow** in the consent banner. Advertising features and Google signals are off, and weather
files, plans and inputs are never sent. Set `FIREBASE.analytics` to `false` to remove analytics entirely.

### Weather files on the site

The weather repositories do not send CORS headers, so the browser cannot fetch their files directly. Before each
deploy, the workflows run `website/tools/mirror_epw.py`, which downloads every file in `data/india-stations.json`
(about 1,000 files from Climate.OneBuilding.org and the EnergyPlus S3 bucket), repacks each one to a zip holding only
the `.epw` (about 0.2 MB) and writes them to `website/epw/` with an `index.json`. The browser loads a station from
`epw/` when it is listed there. The folder is cached between workflow runs and is not committed to git (about 180 MB).

### What the Cloud Function does

`GET /api/epw?url=…` downloads a `.zip` or `.epw` weather file and returns it to the browser. The weather repositories do not
send CORS headers, so the browser cannot fetch these files directly. The function is restricted to
climate.onebuilding.org, energyplus.net and the EnergyPlus S3 bucket. It rejects other hosts, ports, credentials and
redirects, caps files at 30 MB, and checks that the response really is a weather file. Responses carry `s-maxage`, so
Firebase's CDN caches popular stations for a week.

On a host without the function, such as plain static hosting, set `SITE.epwProxy` to `""` in `js/config.js`. Visitors can then
still upload files they have downloaded themselves.

## Tests

```bash
node --test website/tests/science.test.js          # science engine + Vastu plan engine
node --test firebase/functions/test/proxy.test.js  # Cloud Function security rules
python3 website/tools/build_station_catalogue.py   # rebuild data/india-stations.json
```

The tests check UTCI, SolarCal and solar position against reference values from pythermalcomfort and pvlib. They also
cover the NBC classifier, the IMAC equations, EPW parsing, the Vastu scores, the climate metrics for each direction, and
the plan engine and climate strategies: zone geometry for every facing, auto-arrangement of every house type without errors, the plan checks and
share-link round trips.

The NBC/ECBC classifier uses each month's mean maximum temperature and mean daytime (09–18 h) humidity. On ISHRAE
weather files for 12 cities with known code zones, it reproduced the official zone for 11; Jaipur is the borderline miss.

## Third-party code

- Plotly.js 2.35.2 (MIT) and JSZip 3.10.1 (MIT) are vendored in `vendor/`. Map outlines are Natural Earth data via Plotly's topojson files.
- The UTCI polynomial and SolarCal method are ported from pythermalcomfort (MIT).

## Citation

If you use this website, please cite the CBE Clima Tool:

> Betti, G., Tartarini, F., Nguyen, C., Schiavon, S. CBE Clima Tool: A free and open-source web application for climate
> analysis tailored to sustainable building design. *Build. Simul.* (2023). https://doi.org/10.1007/s12273-023-1090-5
