# Phase 1 plan

Status on 2026-10-07: written, waiting for the owner's approval. Nothing below is built yet.

Phase 1 builds a map app for a laptop and a phone that shows, for any state or province, who at HPE covers it, which partners work there, and which prospects sit there. It ships with an empty database, and only files the owner imports fill it.

## Where the work runs

- Every session runs in a Claude Code cloud container with this repository attached, so nothing builds or runs on the owner's machine.
- The cloud environment reaches the npm registry and `raw.githubusercontent.com`, which serves Natural Earth's own GeoJSON files from `nvkelso/natural-earth-vector`, so the boundary download needs no network change.
- `naciscdn.org` and `naturalearthdata.com` do not answer from the container. The plan does not need them.
- Chromium for Playwright is preinstalled in the container, so the headless screenshot step works.

## Stack

- I agree with React, Vite, and TypeScript in strict mode, with d3-geo for drawing. The map has about 64 regions and a few hundred pins, which SVG draws without trouble on a phone, and a tile library would bring the server or API key the brief rules out.
- d3-zoom handles pan and pinch. Region borders use `vector-effect: non-scaling-stroke`, so they stay thin at every zoom level. Pins start as SVG; if the phone test drops frames with 500 pins, they move to a canvas layer.
- The projection is a Lambert conformal conic (`d3.geoConicConformal`) with central meridian -96 and standard parallels 20 and 60, the usual North America setup (ESRI:102009), tuned by eye against the reference screenshot. Alaska stays in its true position. Hawaii gets its own small projection in an inset box.
- Boundaries come from Natural Earth 10m admin-1 for the US and Canada and 50m admin-0 for every other country, which is drawn gray. A script in `scripts/` downloads them once into the gitignored `.cache/`, filters them, simplifies them with mapshaper, and writes `public/geo/north-america.topo.json`. The script fails if any code in `config/territories.json` has no matching shape.
- I picked 10m over 50m for states and provinces because small regions (Rhode Island, Delaware, Prince Edward Island) and the BC coast look coarse at 50m once zoomed. The 10m source is 41 MB for the world; filtering and simplifying cuts it down, and the M1 PR reports the committed file size.
- vite-plugin-pwa (Workbox) builds the manifest and the service worker. It precaches the app shell and the TopoJSON. Imported data lives in IndexedDB, which the browser keeps offline.
- The runtime libraries are `topojson-client`, `idb` (a thin IndexedDB wrapper), `papaparse` (CSV), `zod` (row validation with readable errors), and `zustand` (app state). All are free with MIT or ISC licenses.
- Vitest runs the unit tests and Playwright runs the screenshot and smoke tests.
- There is no component library. Plain CSS with custom properties carries light and dark themes, the HPE chrome colors, and the territory colors from config.

## Architecture

- `config/territories.json` holds territories, colors, legend counts, members with `confirmed`, and fiscal year. No component refers to a territory by name.
- `src/data/` is the only code that touches storage. It exposes one `DataStore` interface (list, get, put, remove, import a batch, clear, export a snapshot). M1 and M2 run on a fixtures implementation, and M3 adds the IndexedDB implementation. A hosted database later is a third implementation of the same interface.
- `src/import/` holds the CSV and JSON parsers and validators, kept apart from storage so unit tests run without a browser.
- `src/map/` draws regions, pins, and the Hawaii inset and handles zoom. `src/ui/` holds cards, panels, sheets, filters, search, and the People and Partners views.
- `fixtures/sample/` holds fake records ("Sample Co 1", "Sample Person A") with `is_sample: true`. Loading any of them shows the sample data banner.
- Edits from the territory editor sit as a local draft over the committed config until the owner exports them. If the committed config changes while a draft exists, the app says so and asks whether to keep or discard the draft.

## Milestones

Each milestone gets one branch (`m1-map`, `m2-interactions`, `m3-data`, `m4-people-partners`, `m5-hardening`) and one draft PR. Each branch starts from the previous milestone's branch and each PR targets that branch, so every PR shows only its own milestone. When the owner merges a PR, GitHub retargets the next one to `main`. Claude merges nothing.

Before each PR, Claude runs `tsc --noEmit`, the unit tests, and `vite build`, then runs Playwright against the production build with sample data at 1440 by 900 and 390 by 844 in light and dark mode, reads every screenshot, fixes what is wrong, and commits the final set to `docs/screenshots/<milestone>/`.

### M1 map

- The boundary script and the committed TopoJSON land, with source and license in the README.
- `config/territories.json` is seeded from the brief's table. Members in unconfirmed rows are marked unconfirmed, PacNorthwest and Midwest stay one short, and Alberta, DC, and Hawaii stay unassigned.
- The map draws territory fills, thin white borders, gray neighbors, the #EEF1F4 background, the Hawaii inset, and the hatch on unconfirmed members.
- The app opens on PacNorthwest (a setting) with the rest dimmed, and has a zoom-out button and a territory picker.
- The legend shows each territory's color, its team (which says "no people imported yet" until there are people), and its member count next to its legend count.
- The PWA shell has a manifest, icons, a service worker, and standalone display.
- Unit tests cover the config schema, region lookup, and count checks.
- M1 is done when the 1440 by 900 screenshot reads like the reference map and every control in the 390 by 844 screenshot sits within thumb reach in the bottom part of the screen.

### M2 interactions

- The territory card opens on hover on a laptop and as a bottom sheet on a phone, and lists the territory team, other HPE people by role, top partners, the prospect count, and the open deal count.
- Selecting a state zooms to it and shows pins at HQ locations, with "location unverified" pins at the state's center for prospects without coordinates.
- The pin panel has Brief, Stakeholders (an org tree from `reports_to`), Coverage, and Deals. It slides in from the side on a laptop and is a full-height sheet on a phone. Every brief item shows its source link and date, and inferred items look different from confirmed ones.
- The filter bar filters by territory, tier fit, partner, and open deal. The overlap highlight and its filter work, and search finds people, partners, and prospects.
- Unit tests cover the overlap rule, the filters, and search.

### M3 data

- The IndexedDB `DataStore` lands, with CSV imports for people, coverage, partners, prospects, and deals and JSON imports for briefs and stakeholders.
- Every import validates each row and reports every rejected row with its row number, column, and reason. Deals match on `op_id` only.
- Empty states say what is missing and which import file fills it.
- The sample data banner shows whenever any sample row is loaded.
- The territory editor lets the owner select a region, move it, confirm a member, see count warnings, and export `territories.json`.
- "Export everything" and "Restore from file" move the whole database as one JSON file (see decisions below).
- Unit tests cover every import validator with good and bad rows, `op_id` format and uniqueness, and editor moves and counts.

### M4 people and partners

- The People and Partners views show sortable tables on a laptop and lists on a phone, with edit forms that validate and that set `verified_at` and `updated_by` on save.

### M5 hardening

- Territories, regions, and pins are reachable by keyboard, have screen reader labels, and keep a sensible focus order inside panels and sheets.
- Every territory color and label is checked for contrast against the background in both themes.
- The app handles a failed import, storage that is full or denied, a TopoJSON that fails to load, and a service worker update.
- The README explains how to run, build, and import, and lists the columns for each import file.
- A full screenshot pass closes the milestone.

## Questions for the owner before M1

1. The repository is public, so everything committed is readable by anyone: the FY27 territory layout in `territories.json`, the screenshots, and the brief. I recommend making it private (Settings, General, Danger Zone, Change repository visibility). Cloud sessions work the same either way. The brief named two real people, so under its own rule `CLAUDE.md` replaces both names with roles; say if you want the names back.
2. A phone installs a PWA only from an HTTPS site, so the phone cannot install the app from a development server, and the brief puts hosting outside phase 1. GitHub Pages is free for a public repository and needs no new account. For a private repository it needs a paid GitHub plan, and Cloudflare Pages is free but is a new account. In every case the site is reachable by anyone with the URL, but it holds no prospect or people data, because imports stay in each browser. I recommend deciding after M1 merges; development and screenshots need no hosting.
3. The legend counts add up to 63, and the table lists 61 members plus two unclear slots. The regions in no row are Alberta, DC, and Hawaii. If Hawaii is off the reference map, the arithmetic puts Alberta and DC in the two open slots, which would place DC in PacNorthwest or Midwest. That looks wrong, so a count may be misread, or DC may not be on the reference map at all (guess: "Fed" in "New York and Fed" may mean DC, but that row's count of 2 says otherwise). I will seed exactly what the brief says. Please check Alberta's color and DC on the screenshot.
4. On a phone, one tap on a state has to do two jobs the brief gives it: open the territory card and select the state. I propose that the first tap opens the territory card as a bottom sheet naming the tapped state, with a "Zoom to Washington" button, and a second tap on the same state zooms. On a laptop, hover opens the card and a click zooms.
5. The brief gives the import files no ID columns, but coverage, deals, prospects (primary partner, HPE owner), briefs, and stakeholders all point at other records, and names are not unique. I propose that people are keyed by email (required, unique), that prospects, partners, and stakeholders each carry an `id` column the owner assigns (a short slug such as `sample-co-1`), and that every reference column uses those keys (`person_email`, `prospect_id`, `partner_id`, and `reports_to` as a stakeholder id). The deals CSV then needs a `prospect_id` next to `op_id`, which the owner fills in when exporting deals.
6. Please paste the reference screenshot into the session chat rather than committing it. M1's done test compares against it, and I have not seen it.

## Decisions (the owner can change any of them)

- Each browser holds its own copy of the data, so an import on the laptop never reaches the phone, and on an iPhone the home screen app keeps its storage apart from Safari. M3 adds "Export everything" and "Restore from file" so the owner can carry the data between devices, and the app asks the browser for persistent storage so it is not evicted. Those files belong in `data/` or the owner's own folders, never in Git.
- Pins show at territory focus and at state zoom. At the full continent view, each state shows a prospect count in place of pins, because a few hundred pins at that scale would cover the map.
- The overlap rule counts distinct account coverage roles among the people linked to a prospect in `coverage`, excluding EAM. "Other" counts as one role however many people hold it.
- `people.role` accepts more than one role separated by semicolons, so a person who holds two roles is one row. A networking specialist carries an optional `specialty` of `aruba` or `juniper`.
- A territory's team is the people whose roles include Morpheus specialist or OpsRamp specialist and whose `territories` include that territory.
- White text on HPE green #01A982 measures about 3.0 to 1, below the 4.5 to 1 that body text needs. Green is used for fills and accents with navy or near-black text on it, and white text sits on navy #425563 (about 7.7 to 1). Map labels pick dark or light text per territory fill by computed contrast.
- Dark mode keeps the territory colors as they are in the config, because they are data, and darkens the background, the neighboring countries, and the chrome.
- Six of the nine territories start fully hatched because the brief marks them unconfirmed. That is expected in the M1 screenshots and clears as the owner confirms members in the M3 editor.
