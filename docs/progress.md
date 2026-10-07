# Progress

Read `CLAUDE.md` first, then this file, then `docs/plan.md`.

## Done

- 2026-10-07: The brief went in as `CLAUDE.md`, with the two real names replaced by roles under the brief's own rule. `.gitignore` excludes `data/` from the first commit after the initial README.
- 2026-10-07: `docs/plan.md` holds the phase 1 plan, the stack, and the decisions taken so far.
- 2026-10-07: The owner answered the first questions. Phones are out, so the brief lost its phone, PWA, and 390 by 844 items. PacNorthwest is confirmed as AK, WA, OR, ID, MT, WY, BC, and YT. The reference screenshot put Alberta in Midwest, and the brief's table now says so.
- 2026-10-07: The owner approved the plan ("go start").
- 2026-10-07: M1 (map) is built on branch `m1-map`: boundary build, `config/territories.json`, the map with territory colors, white borders, gray neighbors, hatch on unconfirmed members, PacNorthwest focus with the rest dimmed, territory picker, My territory and North America buttons, settings (my territory, theme), legend with teams and counts, Hawaii inset, light and dark mode, sample data banner, 21 unit tests, screenshots in `docs/screenshots/m1/`.

- 2026-10-07: M2 (interactions) is built on branch `m2-interactions`: hover cards, click-to-zoom on a state, pins with "location unverified" and overlap markers, per-state counts at the continent view, the side panel with Brief, Stakeholders (org tree), Coverage, and Deals, a person panel and a partner panel, the filter bar, the overlap filter, and search. 48 unit tests. Screenshots in `docs/screenshots/m2/`.

## Next

- M3 (data) on branch `m3-data`, stacked on `m2-interactions`.

## Open questions

- The repository is still public, so the reference screenshot crop (legend blanked) is not committed yet. Once the owner makes the repository private, a later milestone commits it to `docs/reference/`.
- Hosting, so the owner can click around in the app. See "Open items" in `docs/plan.md`.

## Decisions and why

- The decisions taken in planning are listed in `docs/plan.md` under "Decisions". New ones go here with a date.
- 2026-10-07: Natural Earth GeoJSON comes from `raw.githubusercontent.com/nvkelso/natural-earth-vector`, because the cloud environment reaches it and does not reach `naciscdn.org` or `naturalearthdata.com`.
- 2026-10-07: The reference screenshot stays out of Git because its legend names real people.
- 2026-10-07: Toolchain versions are pinned exactly and are the newest releases at least two weeks old at install time: React 19.3, Vite 8.3.0, Vitest 4.1.11 (Vitest 5 crashes npm 10.9's resolver), TypeScript 5.9.3, mapshaper 0.7.66. `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes on Vitest's optional peers; every peer the app needs is listed directly. `package.json` overrides mapshaper's `fflate` and `adm-zip` to patched versions so `npm audit` is clean; mapshaper reads GeoJSON here and never touches zip files.
- 2026-10-07: Boundaries use the `_lakes` variants, so the Great Lakes show as water like the reference. The build keeps 6% of points (116 KB of TopoJSON), which stays sharp at state zoom.
- 2026-10-07: The default view frames Alaska's west coast to Newfoundland and the Gulf coast to the mainland Arctic coast, so the high Arctic islands run off the top like the reference. It leaves a wider margin on the left so the legend sits over the Pacific.
- 2026-10-07: Framing a territory ignores small outlying islands (polygons under 2% of the region's largest), so PacNorthwest frames mainland Alaska rather than the whole Aleutian chain, and keeps clear of the legend.
- 2026-10-07: The legend leads with the territory name and puts the team under it, because team names wrap and the territory is what the viewer scans for. It can be hidden. Clicking a row frames that territory.
- 2026-10-07: The Hawaii inset sits at the bottom, right of the legend, over the Pacific. It is never dimmed, because it is an index box rather than part of the map.
- 2026-10-07: `?sample=1` loads the fake fixtures into memory and saves nothing. It is how the screenshots get sample data.
- 2026-10-07: The viewer's own territory and theme are saved in the browser's `localStorage`, a per-viewer convenience. If storage is blocked, they last for the visit.
- 2026-10-07: A deal is open unless its stage starts with "Closed" (Closed Won, Closed Lost). Salesforce stage names vary, so anything else counts as open.
- 2026-10-07: The territory picker moved from the header into the filter bar, because picking a territory both frames the map and filters the pins; two controls for one thing would disagree.
- 2026-10-07: "Other HPE people" on a territory card are people with an account coverage role whose `states` include any state in the territory. Top partners are partners working in the territory, ranked by how many of its prospects name them as primary partner, then by VME experience (yes, unknown, no); the card shows three.
- 2026-10-07: Search matches names only. A name that starts with the query ranks first, then a name with a word that starts with it, then any other match, ignoring case and accents. `/` focuses the search box. Picking a prospect zooms to it and opens its panel; picking a person or partner outlines their states and opens their panel.
- 2026-10-07: Pins and count badges keep a constant screen size at any zoom through a CSS variable for the zoom scale, so panning never re-renders React. With 600 pins (`?sample=stress`), headless Chromium held 16.7 ms frames (60 per second) while panning and zooming.
- 2026-10-07: The sample fixtures are generated by `scripts/sample-fixtures.mjs` with a seeded random generator, so they never change between runs. Cities and coordinates are real places; every name, email, and URL is fake (`example.com`).
