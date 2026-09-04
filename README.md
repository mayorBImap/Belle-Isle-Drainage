# Belle Isle Stormwater Planning Tool

A static, GitHub Pages-ready interactive website for exploring stormwater infrastructure in Belle Isle, Florida using public Orange County ArcGIS services.

## What this version does

- Loads the City of Belle Isle boundary from Orange County's **Jurisdiction Dissolved** layer.
- Loads and clips public drainage features to Belle Isle in the user's browser.
- Displays drainwells, stormwater structures/inlets, ditches/swales, pipes, ponds, control structures and pollution-control devices.
- Adds Orange County iWorQ infrastructure: primary/secondary canals, canal segments, pump stations, culverts, pond structures and major drainage structures.
- Adds hydrology and major drainage basin context.
- Provides a **Planning Trace** mode. Select a mapped feature or map location and the tool highlights nearby features whose endpoints fall within a user-selected proximity tolerance.
- Generates planning flags from published condition, outfall and inspection-date attributes when those fields exist.
- Includes street/address search, feature popups, layer counts and mobile layout.

## Important limitation

The Planning Trace is **not a hydraulic or engineering model**. It uses proximity between public GIS geometries. It cannot establish actual flow direction, invert elevations, pipe capacity, ownership, maintenance responsibility, flood risk or system sufficiency. Field survey, City records and engineering analysis should control official decisions.

Orange County's culvert layer specifically describes culverts maintained by Orange County Public Works Stormwater Division; it should not be treated as a complete inventory of all City/private culverts.

## Publish on GitHub Pages

1. Create a new GitHub repository, for example `belle-isle-stormwater`.
2. Upload the files in this folder to the repository root: `index.html`, `styles.css`, `app.js`, `.nojekyll`.
3. Commit the files.
4. In GitHub open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose branch **main** and folder **/(root)**, then Save.
7. GitHub will show the public URL after deployment. It will typically look like `https://YOUR-USERNAME.github.io/belle-isle-stormwater/`.

No build process, server or database is required.

## Data services

- Orange County AGOL Open Data2: `https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data2/MapServer`
- Orange County iWorQ: `https://ocgis4.ocfl.net/arcgis/rest/services/iWorQ/MapServer`
- Orange County Open Data: `https://ocgis4.ocfl.net/arcgis/rest/services/AGOL_Open_Data/MapServer`
- Basemap: OpenStreetMap
- Address search: OpenStreetMap Nominatim

The County describes AGOL_Open_Data2 as public data updated weekly.

## Files

- `index.html` — application markup and controls
- `styles.css` — responsive layout and map UI
- `app.js` — GIS loading, clipping, planning trace, flags and search
- `.nojekyll` — tells GitHub Pages to serve the static files directly

## Local preview

Because browsers may restrict requests when an HTML file is opened directly from disk, preview through a small local web server if possible:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
