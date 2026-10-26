# Climate Studio India

A climate-analysis and passive-design website for Indian buildings. It is a new browser-only edition of the
[CBE Clima Tool](https://github.com/CenterForTheBuiltEnvironment/clima). There is no server: it reads an EnergyPlus Weather
file (`.epw`, or the `.zip` that Climate.OneBuilding.org provides) and does every calculation in the visitor's browser.

## Put your company on it

All branding lives in **`js/config.js`**: company name, product name, logo letters, tagline, website, email,
phone, address and brand colour. Every page, the footer, chart-export filenames and the citation text read from that file.

## Tools

| Page | What it does |
| --- | --- |
| Home & weather data | Load data by drag-and-drop, file picker, URL or demo. Includes a directory of 48 Indian cities with a map and links to free EPW sources |
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

Any static file server works:

```bash
cd website
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

The site is plain static files, so you can upload the `website/` folder to any host: GitHub Pages, Netlify, Cloudflare Pages,
S3 or shared hosting. The included workflow `.github/workflows/website.yml` runs the tests on every change. To have it
also publish to GitHub Pages from `main`, set **Settings → Pages → Source** to "GitHub Actions" and add the repository
variable `ENABLE_PAGES=true`.

## Tests

```bash
node --test website/tests/science.test.js
```

The tests check UTCI, SolarCal and solar position against reference values from pythermalcomfort and pvlib. They also
check the NBC classifier, the IMAC equations and EPW parsing.

## Third-party code

- Plotly.js 2.35.2 (MIT) and JSZip 3.10.1 (MIT) are vendored in `vendor/`. Map outlines are Natural Earth data via Plotly's topojson files.
- The UTCI polynomial and SolarCal method are ported from pythermalcomfort (MIT).

## Citation

If you use this website, please cite the CBE Clima Tool:

> Betti, G., Tartarini, F., Nguyen, C., Schiavon, S. CBE Clima Tool: A free and open-source web application for climate
> analysis tailored to sustainable building design. *Build. Simul.* (2023). https://doi.org/10.1007/s12273-023-1090-5
