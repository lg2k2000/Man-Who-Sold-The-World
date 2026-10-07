# Progress

Read `CLAUDE.md` first, then this file, then `docs/plan.md`.

## Done

- 2026-10-07: The brief went in as `CLAUDE.md`, with the two real names replaced by roles under the brief's own rule. `.gitignore` excludes `data/` from the first commit after the initial README.
- 2026-10-07: `docs/plan.md` holds the phase 1 plan, the stack, and the decisions taken so far.
- 2026-10-07: The owner answered the first questions. Phones are out, so the brief lost its phone, PWA, and 390 by 844 items. PacNorthwest is confirmed as AK, WA, OR, ID, MT, WY, BC, and YT. The reference screenshot put Alberta in Midwest, and the brief's table now says so.
- 2026-10-07: The owner approved the plan ("go start").
- 2026-10-07: M1 (map) is built on branch `m1-map`: boundary build, `config/territories.json`, the map with territory colors, white borders, gray neighbors, hatch on unconfirmed members, PacNorthwest focus with the rest dimmed, territory picker, My territory and North America buttons, settings (my territory, theme), legend with teams and counts, Hawaii inset, light and dark mode, sample data banner, 21 unit tests, screenshots in `docs/screenshots/m1/`.

## Next

- M2 (interactions) on branch `m2-interactions`, stacked on `m1-map`.

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
