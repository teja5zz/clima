# Climate & Vastu Studio — Tejas Constructions

A climate-analysis, comfort and **Vastu × Science** planning website for Indian buildings, by Tejas Constructions
(Tejas P R, BE, MS — Chartered Structural Engineer, Mysore). It is a browser-first edition of the open-source
[CBE Clima Tool](https://github.com/CenterForTheBuiltEnvironment/clima), hosted on **Firebase**: static files on
Firebase Hosting, plus one Cloud Function in Mumbai (`asia-south1`) that fetches weather files for the browser.

## Brand settings

All company details live in **`js/config.js`**: name, logo, tagline, phone, email, website, address, services and colours.

## Tools

| Page | What it does |
| --- | --- |
| Home & choose location | Search 405 Indian weather stations (Climate.OneBuilding.org TMYx, ISHRAE, IWEC) by city, district or state, or use "Near me", then load one with a click. You can also upload an EPW/ZIP or paste a link |
| **Vastu × Science planner** | The Tejas Constructions Vastu Wheel, rotatable over your own plan image, with sun path, afternoon façade heat and seasonal wind overlays. Every room gets a Vastu score and a climate score with reasons, plus a blended suggested layout and conflict-resolution advice |
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

## Deploy to Firebase

1. Create a Firebase project and upgrade it to the **Blaze** (pay-as-you-go) plan, which Cloud Functions require.
   Typical traffic for this site stays within the free monthly quota.
2. Put the project ID in `.firebaserc` (replace `your-firebase-project-id`).
3. Deploy from the repository root:

   ```bash
   npm install -g firebase-tools
   firebase login
   npm install --prefix firebase/functions
   firebase deploy --only hosting,functions
   ```

4. Optional: connect your own domain, such as `tools.tejas-constructions.in`, under Hosting → Add custom domain.

**Automatic deploys:** `.github/workflows/website.yml` runs all tests on every change. It deploys from `main` once you add
the repository variable `FIREBASE_PROJECT_ID` and the secret `FIREBASE_SERVICE_ACCOUNT`, which is the JSON key of a
service account with the *Firebase Admin* role.

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
node --test website/tests/science.test.js          # science engine + Vastu planner
node --test firebase/functions/test/proxy.test.js  # Cloud Function security rules
python3 website/tools/build_station_catalogue.py   # rebuild data/india-stations.json
```

The tests check UTCI, SolarCal and solar position against reference values from pythermalcomfort and pvlib. They also
cover the NBC classifier, the IMAC equations, EPW parsing, the Vastu scores, the climate metrics for each direction and
the room assignment.

The NBC/ECBC classifier uses each month's mean maximum temperature and mean daytime (09–18 h) humidity. On ISHRAE
weather files for 12 cities with known code zones, it reproduced the official zone for 11; Jaipur is the borderline miss.

## Third-party code

- Plotly.js 2.35.2 (MIT) and JSZip 3.10.1 (MIT) are vendored in `vendor/`. Map outlines are Natural Earth data via Plotly's topojson files.
- The UTCI polynomial and SolarCal method are ported from pythermalcomfort (MIT).

## Citation

If you use this website, please cite the CBE Clima Tool:

> Betti, G., Tartarini, F., Nguyen, C., Schiavon, S. CBE Clima Tool: A free and open-source web application for climate
> analysis tailored to sustainable building design. *Build. Simul.* (2023). https://doi.org/10.1007/s12273-023-1090-5
