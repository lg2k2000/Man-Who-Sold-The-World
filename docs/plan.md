# Phase 1 plan

Status: approved by the owner on 2026-10-07 ("go start"). Phase 1 was built on 2026-10-07 and 08 as M1 to M5. M6 (map detail) and M7 (CRM and spreadsheet import) followed on 2026-10-08 at the owner's request; `docs/progress.md` records what changed from this plan and why.

Phase 1 builds a web app for a laptop browser that shows, for any state or province, who at HPE covers it, which partners work there, and which prospects sit there. It ships with an empty database, and only files the owner imports fill it.

## Owner answers on 2026-10-07

- Phones are out of scope. The app is a web app for a laptop browser, so the progressive web app, the service worker, the phone layouts, and the 390 by 844 screenshots are gone from the brief and from this plan.
- The repository goes private. The owner changes the visibility in GitHub, because no tool in the cloud session can.
- PacNorthwest is Alaska, Washington, Oregon, Idaho, Montana, Wyoming, British Columbia, and the Yukon, confirmed by the owner. The reference legend says 9, so the territory stays one short and shows a count warning. The owner said "some of the Yukon"; a territory member is a whole province or territory, so the Yukon counts as one member.
- The owner supplied the reference screenshot. It shows Alberta in Midwest's yellow, which brings Midwest to the 10 its legend shows. The screenshot carries real names in its legend, so it stays out of Git (see the reference section below).

## Where the work runs

- Every session runs in a Claude Code cloud container with this repository attached, so nothing builds or runs on the owner's machine.
- The cloud environment reaches the npm registry and `raw.githubusercontent.com`, which serves Natural Earth's own GeoJSON files from `nvkelso/natural-earth-vector`, so the boundary download needs no network change.
- `naciscdn.org` and `naturalearthdata.com` do not answer from the container. The plan does not need them.
- Chromium for Playwright is preinstalled in the container, so the headless screenshot step works.

## The reference map, described without names

- The map is a conic projection of North America with Alaska in place at the upper left, the Aleutians running off the left edge, and the Canadian Arctic islands across the top.
- Territory fills are flat colors with thin white borders between every state and province. The Great Lakes and Hudson Bay show as water in the background color.
- Russia's tip, Greenland, Mexico, Central America, and the Caribbean are light warm gray. The background is light blue-gray.
- The title "FY27 Sales Rep Territory Coverage" sits at the top left.
- The legend is a white box at the bottom left, over the Pacific and Mexico. Each row has a color swatch, the team in bold (two Morpheus specialists and one OpsRamp specialist), a smaller line with the territory name, and the member count on the right.
- Once the repository is private, M1 commits a crop of the screenshot with the legend blanked out (no names) to `docs/reference/`, so later sessions can compare against it.

## Stack

- I agree with React, Vite, and TypeScript in strict mode, with d3-geo for drawing. The map has about 64 regions and a few hundred pins, which SVG draws without trouble, and a tile library would bring the server or API key the brief rules out.
- d3-zoom handles pan and zoom. Region borders use `vector-effect: non-scaling-stroke`, so they stay thin at every zoom level.
- The projection is a Lambert conformal conic (`d3.geoConicConformal`), tuned against the reference screenshot. Alaska stays in its true position. Hawaii gets its own small projection in an inset box.
- Boundaries come from Natural Earth 10m admin-1 with large lakes removed (the `_lakes` file, so the Great Lakes show as water like the reference) for the US and Canada, and 50m admin-0 for every other country, drawn gray. A script in `scripts/` downloads them once into the gitignored `.cache/`, filters them, simplifies them with mapshaper, and writes `public/geo/north-america.topo.json`. The script fails if any code in `config/territories.json` has no matching shape.
- I picked 10m over 50m for states and provinces because small regions (Rhode Island, Delaware, Prince Edward Island) and the BC coast look coarse at 50m once zoomed. Filtering and simplifying cut the 41 MB source down, and the M1 PR reports the committed file size.
- The runtime libraries are `topojson-client`, `idb` (a thin IndexedDB wrapper), `papaparse` (CSV), `zod` (row validation with readable errors), and `zustand` (app state). All are free with MIT or ISC licenses.
- Vitest runs the unit tests and Playwright runs the screenshot and smoke tests.
- There is no component library. Plain CSS with custom properties carries light and dark themes, the HPE chrome colors, and the territory colors from config.

## Architecture

- `config/territories.json` holds territories, colors, legend counts, members with `confirmed`, and fiscal year. No component refers to a territory by name.
- `src/data/` is the only code that touches storage. It exposes one `DataStore` interface (list, get, put, remove, import a batch, clear, export a snapshot). M1 and M2 run on a fixtures implementation, and M3 adds the IndexedDB implementation. A hosted database later is a third implementation of the same interface.
- `src/import/` holds the CSV and JSON parsers and validators, kept apart from storage so unit tests run without a browser.
- `src/map/` draws regions, pins, and the Hawaii inset and handles zoom. `src/ui/` holds cards, panels, filters, search, and the People and Partners views.
- `fixtures/sample/` holds fake records ("Sample Co 1", "Sample Person A") with `is_sample: true`. Loading any of them shows the sample data banner.
- Edits from the territory editor sit as a local draft over the committed config until the owner exports them. If the committed config changes while a draft exists, the app says so and asks whether to keep or discard the draft.

## Milestones

Each milestone gets one branch (`m1-map`, `m2-interactions`, `m3-data`, `m4-people-partners`, `m5-hardening`) and one draft PR. Each branch starts from the previous milestone's branch and each PR targets that branch, so every PR shows only its own milestone. When the owner merges a PR, GitHub retargets the next one to `main`. Claude merges nothing.

Before each PR, Claude runs `tsc --noEmit`, the unit tests, and `vite build`, then runs Playwright against the production build with sample data at 1440 by 900 in light and dark mode, reads every screenshot, fixes what is wrong, and commits the final set to `docs/screenshots/<milestone>/`.

### M1 map

- The boundary script and the committed TopoJSON land, with source and license in the README.
- `config/territories.json` is seeded from the brief's table. PacNorthwest's eight members are confirmed, the other unconfirmed rows stay unconfirmed, PacNorthwest stays one short of its legend count, and DC and Hawaii stay unassigned.
- The map draws territory fills, thin white borders, gray neighbors, the background color, the Hawaii inset, and the hatch on unconfirmed members.
- The app opens on PacNorthwest (a setting) with the rest dimmed, and has a zoom-out button and a territory picker.
- The legend follows the reference layout: color, team (which says "no people imported yet" until there are people), territory name, and member count next to legend count.
- Unit tests cover the config schema, region lookup, and count checks.
- M1 is done when the 1440 by 900 screenshot reads like the reference map.

### M2 interactions

- Hovering a territory opens its card, which lists the territory team, other HPE people by role, top partners, the prospect count, and the open deal count.
- Clicking a state zooms to it and shows pins at HQ locations, with "location unverified" pins at the state's center for prospects without coordinates.
- Clicking a pin opens a side panel with Brief, Stakeholders (an org tree from `reports_to`), Coverage, and Deals. Every brief item shows its source link and date, and inferred items look different from confirmed ones.
- The filter bar filters by territory, tier fit, partner, and open deal. The overlap highlight and its filter work, and search finds people, partners, and prospects.
- Unit tests cover the overlap rule, the filters, and search.

### M3 data

- The IndexedDB `DataStore` lands, with CSV imports for people, coverage, partners, prospects, and deals and JSON imports for briefs and stakeholders.
- Every import validates each row and reports every rejected row with its row number, column, and reason. Deals match on `op_id` only.
- Empty states say what is missing and which import file fills it.
- The sample data banner shows whenever any sample row is loaded.
- The territory editor lets the owner select a region, move it, confirm a member, see count warnings, and export `territories.json`.
- "Export everything" and "Restore from file" save and reload the whole database as one JSON file, as a backup against cleared browser data.
- Unit tests cover every import validator with good and bad rows, `op_id` format and uniqueness, and editor moves and counts.

### M4 people and partners

- The People and Partners views are sortable tables with edit forms that validate and that set `verified_at` and `updated_by` on save.

### M5 hardening

- Territories, regions, and pins are reachable by keyboard, have screen reader labels, and keep a sensible focus order inside panels.
- Every territory color and label is checked for contrast against the background in both themes.
- The app handles a failed import, storage that is full or denied, a TopoJSON that fails to load, and a browser that blocks IndexedDB.
- The README explains how to run, build, and import, and lists the columns for each import file.
- A full screenshot pass closes the milestone.

### M6 map detail (added 2026-10-08)

- The owner asked for a map "way more detailed" than the reference, and chose detail bundled with the app over a tile service, with every free layer: cities and towns, highways, rivers and lakes, metro areas, US county lines, and state and province names.
- Labels are placed so none overlap, and more appear with zoom. A layers menu turns each kind on or off.
- Panning stays smooth with every layer on and 600 pins.

### M7 CRM and spreadsheet import (added 2026-10-08)

- The owner wants the app to work as a CRM (companies, contacts, deals) with dollar amounts, and wants the manager's Excel deal sheet to go in with little effort.
- Companies replace prospects and partners; contacts replace stakeholders and partner contacts; deals gain names, amounts, forecast category, contacts, and next steps, and an op ID becomes optional.
- Imports read Excel, CSV, JSON, and pasted rows, match columns by name, link rows to companies and people by name, and preview every change before saving.
- Hosting and an MCP server come later, on Neon and Railway, when the owner says go.

## Open items that do not block M1

- Opening the app needs it served from somewhere. During the build, the owner reviews the screenshots in each PR. To click around in it, the app either runs on a laptop with `npm run dev` or goes on a host. GitHub Pages needs a paid GitHub plan for a private repository, and Cloudflare Pages or Netlify is free but is a new account. That is the owner's call, and nothing in phase 1 deploys without it.
- PacNorthwest's legend count of 9 has eight confirmed members, and DC sits in no territory. Both stay as they are until the owner says otherwise.

## Decisions (the owner can change any of them)

- People are keyed by email (required, unique). Prospects, partners, and stakeholders each carry an `id` column the owner assigns (a short slug such as `sample-co-1`), and every reference column uses those keys (`person_email`, `prospect_id`, `partner_id`, and `reports_to` as a stakeholder id). The deals CSV carries `prospect_id` next to `op_id`. The brief gives the import files no ID columns, and names are not unique.
- Pins show at territory focus and at state zoom. At the full continent view, each state shows a prospect count in place of pins, because a few hundred pins at that scale would cover the map.
- The overlap rule counts distinct account coverage roles among the people linked to a prospect in `coverage`, excluding EAM. "Other" counts as one role however many people hold it.
- `people.role` accepts more than one role separated by semicolons, so a person who holds two roles is one row. A networking specialist carries an optional `specialty` of `aruba` or `juniper`.
- A territory's team is the people whose roles include Morpheus specialist or OpsRamp specialist and whose `territories` include that territory.
- White text on HPE green #01A982 measures about 3.0 to 1, below the 4.5 to 1 that body text needs. Green is used for fills and accents with navy or near-black text on it, and white text sits on navy #425563 (about 7.7 to 1). Map labels pick dark or light text per territory fill by computed contrast.
- Dark mode keeps the territory colors as they are in the config, because they are data, and darkens the background, the neighboring countries, and the chrome.
- Five of the nine territories start hatched because the brief marks them unconfirmed. That is expected in the M1 screenshots and clears as the owner confirms members in the M3 editor.
