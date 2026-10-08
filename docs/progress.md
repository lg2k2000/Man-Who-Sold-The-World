# Progress

Read `CLAUDE.md` first, then this file, then `docs/plan.md`.

## Done

- 2026-10-07: The brief went in as `CLAUDE.md`, with the two real names replaced by roles under the brief's own rule. `.gitignore` excludes `data/` from the first commit after the initial README.
- 2026-10-07: `docs/plan.md` holds the phase 1 plan, the stack, and the decisions taken so far.
- 2026-10-07: The owner answered the first questions. Phones are out, so the brief lost its phone, PWA, and 390 by 844 items. PacNorthwest is confirmed as AK, WA, OR, ID, MT, WY, BC, and YT. The reference screenshot put Alberta in Midwest, and the brief's table now says so.
- 2026-10-07: The owner approved the plan ("go start").
- 2026-10-07: M1 (map) is built on branch `m1-map`: boundary build, `config/territories.json`, the map with territory colors, white borders, gray neighbors, hatch on unconfirmed members, PacNorthwest focus with the rest dimmed, territory picker, My territory and North America buttons, settings (my territory, theme), legend with teams and counts, Hawaii inset, light and dark mode, sample data banner, 21 unit tests, screenshots in `docs/screenshots/m1/`.
- 2026-10-07: M2 (interactions) is built on branch `m2-interactions`: hover cards, click-to-zoom on a state, pins with "location unverified" and overlap markers, per-state counts at the continent view, the side panel with Brief, Stakeholders (org tree), Coverage, and Deals, a person panel and a partner panel, the filter bar, the overlap filter, and search. 48 unit tests. Screenshots in `docs/screenshots/m2/`.

- 2026-10-08: M3 (data) is built on branch `m3-data`: IndexedDB storage behind the `DataStore` interface, CSV and JSON imports with a per-row rejected report, warnings and ignored columns, sample data load and removal, backup export and restore, empty states, the territory editor with count warnings, a draft saved in the browser, and export of `territories.json`. Example import files in `fixtures/import-examples/`. 103 unit tests. Screenshots in `docs/screenshots/m3/`.

- 2026-10-08: M4 (people and partners) is built on branch `m4-people-partners`: People and Partners views with sortable, filterable tables and edit forms beside them, key changes that carry over to every reference, deletes that say what they clear, "Edit in People" and "Edit in Partners" from the map panels, and a Settings field for the editor's name. 116 unit tests. Screenshots in `docs/screenshots/m4/`.

## Next

- M5 (hardening) on branch `m5-hardening`, stacked on `m4-people-partners`.

## Open questions

- The repository is still public, so the reference screenshot crop (legend blanked) is not committed yet. Once the owner makes the repository private, a later milestone commits it to `docs/reference/`.
- Hosting, so the owner can click around in the app. See "Open items" in `docs/plan.md`.

## Decisions and why

- The decisions taken in planning are listed in `docs/plan.md` under "Decisions". New ones go here with a date.
- 2026-10-07: Natural Earth GeoJSON comes from `raw.githubusercontent.com/nvkelso/natural-earth-vector`, because the cloud environment reaches it and does not reach `naciscdn.org` or `naturalearthdata.com`.
- 2026-10-07: The reference screenshot stays out of Git because its legend names real people.
- 2026-10-07: Toolchain versions are pinned exactly and are the newest releases at least two weeks old at install time: React 19.3, Vite 8.3.0, Vitest 4.1.11 (Vitest 5 crashes npm 10.9's resolver), TypeScript 5.9.3, mapshaper 0.7.66. `.npmrc` sets `legacy-peer-deps` because npm 10.9 crashes on Vitest's optional peers; every peer the app needs is listed directly. `package.json` overrides mapshaper's `fflate` and `adm-zip` to patched versions so `npm audit` is clean; mapshaper reads GeoJSON here and never touches zip files.
- 2026-10-07: Boundaries use the `_lakes` variants, so the Great Lakes show as water like the reference. On 2026-10-08 the build moved from 6% to 15% of points (116 KB to 253 KB of TopoJSON) because Puget Sound and similar coasts looked jagged at state zoom; 600-pin panning still holds 60 frames per second.
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
- 2026-10-08: Imports merge by key: a row whose key exists updates that row, new keys are added, and rows the file does not mention stay. A "Replace" box swaps the whole table instead. Keys: people by email, partners, prospects, and stakeholders by id, deals by `op_id`, briefs by `prospect_id`, coverage by person and prospect together.
- 2026-10-08: A row with any bad column is rejected whole, and the report lists every bad column on it, so one pass fixes the file. A duplicate key within a file rejects the later row.
- 2026-10-08: Coverage, deals, briefs, and stakeholders are rejected when their prospect is not imported, because a deal or brief with no prospect cannot show anywhere. A prospect's partner or HPE owner that is not imported yet, a stakeholder's missing manager, and coordinates outside North America are warnings: the row imports and the report says so.
- 2026-10-08: Deals join to prospects through `prospect_id` only. A company name in that column fails the id check and the row is rejected; nothing ever matches on name.
- 2026-10-08: Choosing files shows the table guessed from each file name for the owner to check before anything imports, because a name like "people-at-prospects.csv" can fool a guess.
- 2026-10-08: Multi-value cells use semicolons (commas work when there is no semicolon). Regions accept `WA` or `US-WA`; no US postal code collides with a Canadian one. Roles accept ids or labels ("Morpheus specialist"). Partner contacts are `Name | Title | email` separated by semicolons.
- 2026-10-08: "Load sample data" writes the fixtures into IndexedDB next to any real rows, and "Remove sample data" deletes only rows with `is_sample`. Only a JSON boolean `is_sample` marks a row, so a CSV import can never create sample rows by accident; backups keep the flag.
- 2026-10-08: A backup is one JSON file with a format name and version. Restoring runs every row through the import checks in dependency order and replaces everything after a confirmation.
- 2026-10-08: If the browser blocks IndexedDB, the app runs on in-memory storage and says so on every page, pointing at "Export everything" to keep a copy.
- 2026-10-08: The territory editor works on the map. Edits form a draft saved in `localStorage` with a fingerprint of the committed config. The export writes the file exactly as the committed one is formatted (a test checks it byte for byte). A moved region arrives unconfirmed. Pins and counts hide while editing so the territory fills stay readable.
- 2026-10-08: The Data view lives at `#/data`, so reload and the back button keep it.
- 2026-10-08: Edit forms build the same raw row an import would and run it through the import parsers, so a form can never save what an import would reject, and the messages match.
- 2026-10-08: Changing a person's email or a partner's id is allowed and carries over to coverage, prospect owners, primary partners, and deals, because an email changes when someone's address does and a stale key would orphan their links. Deleting a person or partner clears those references and the confirm dialog says how many.
- 2026-10-08: Editing a sample row keeps `is_sample`, so the banner stays honest.
- 2026-10-08: `updated_by` on an edit is the name in Settings, or "edited in app" when none is set. `source` defaults to "edited in app" when blank.
- 2026-10-08: Sorting puts empty values last in both directions and compares text naturally ("Co 2" before "Co 10").
- 2026-10-08: The edit form sits beside the table rather than over it, so the row being edited stays visible.
- 2026-10-08: Prettier (single quotes, 140 columns) formats the code; M4 applies it to every file in one separate commit so later diffs stay clean.
