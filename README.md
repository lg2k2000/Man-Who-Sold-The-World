# Territory Coverage

A web app for a laptop browser that shows HPE's FY27 sales territories on a map of North America, and for each state or province who at HPE covers it, which partners work there, and which companies are prospects.

The app ships with an empty database. Data comes only from files the owner imports, and it stays in the browser. Nothing real is committed to this repository except `config/territories.json`, which holds geography and colors.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev -- --open
```

Open `http://localhost:5173/?sample=1` to load the fake sample data from `fixtures/sample/` into memory. A banner says so whenever sample rows are loaded. `?sample=stress` triples the sample prospects (600 pins) to check drawing speed.

## Using the map

- Hover a territory to see its card: the territory team, other HPE people covering its states by role, top partners, and counts of prospects and open deals.
- Click a state or province to zoom to it and show its prospects as pins. A prospect without coordinates sits at the state's center with a dashed pin, marked "location unverified".
- Click a pin to open the side panel with Brief, Stakeholders, Coverage, and Deals.
- The filter bar narrows pins by territory, tier fit, primary partner, open deal, and accounts covered by three or more account coverage roles (EAM excluded), which also get a green ring.
- Press `/` to search people, partners, and prospects by name. Picking one frames it on the map and opens its panel.
- At the full continent view each state shows a prospect count; pins appear once a territory or state is chosen or the map is zoomed in.

## Editing territories

Click **Edit** in the legend. Click any state or province to move it to another territory, unassign it, or mark it confirmed. The bar at the top lists every territory whose member count differs from its legend count (you can change the legend count there) and every change in the draft. The draft stays in this browser until you click **Export territories.json**; commit the exported file over `config/territories.json`. If the committed file changes while you have a draft, the map asks whether to keep the draft or use the new file.

## Importing data

Open **Data** in the header. Pick a file; the app guesses its table from the file name (`people.csv`, `acme-briefs.json`) and lets you change it. Every row is checked before anything is saved, and the report lists each rejected row with its row number, column, and reason. Rows with a key that already exists update that row; other rows stay. Tick "Replace" to swap the whole table instead.

Import in this order so references resolve: people and partners, then prospects, then coverage, deals, briefs, and stakeholders. Coverage, deals, briefs, and stakeholders must point at a prospect that is already imported. A prospect's partner or HPE owner that is not imported yet is kept with a warning.

Multi-value cells (roles, territories, states) are separated by semicolons. States accept `WA` or `US-WA`. Dates are `YYYY-MM-DD`.

Data lives in this browser's IndexedDB and never leaves it. "Export everything" saves one JSON backup file; "Restore from file" loads one. Keep import files and backups in `data/` (Git ignores it) or outside the repository.

<!-- import-columns:start -->

### People (`people.csv`)

| Column | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Full name. |
| `email` | yes | Work email; the key for a person. Re-importing the same email updates the person. |
| `role` | yes | One or more of morpheus, opsramp, eam, storage, compute, networking, greenlake, zerto, sled, other, separated by semicolons. Labels such as "Morpheus specialist" also work. |
| `specialty` | no | aruba or juniper, for networking specialists. |
| `territories` | no | Territory teams the person sits on, by id (pacnorthwest) or name (PacNorthwest), separated by semicolons. |
| `states` | no | States and provinces the person covers, such as WA; OR; BC or US-WA; US-OR; CA-BC. |
| `notes` | no | Free text. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Coverage (`coverage.csv`)

| Column | Required | Meaning |
| --- | --- | --- |
| `person_email` | yes | Email of a person already imported. |
| `prospect_id` | yes | Id of a prospect already imported. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Partners (`partners.csv`)

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Your id for the partner, such as acme-it; lowercase letters, digits, and hyphens. |
| `name` | yes | Partner company name. |
| `states` | no | States and provinces the partner works in, separated by semicolons. |
| `has_done_vme` | no | yes, no, or unknown (the default). |
| `has_done_morpheus_enterprise` | no | yes, no, or unknown (the default). |
| `contacts` | no | Name \| Title \| email, with contacts separated by semicolons. |
| `notes` | no | Free text. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Prospects (`prospects.csv`)

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Your id for the prospect, such as acme-seattle; the key every other file uses. |
| `name` | yes | Company name. |
| `hq_city` | no | Headquarters city. |
| `state` | yes | Headquarters state or province, such as WA or CA-BC. |
| `lat` | no | Headquarters latitude. Leave lat and lng empty to pin at the state center as "location unverified". |
| `lng` | no | Headquarters longitude, negative in North America. |
| `industry` | no | Free text. |
| `description` | no | One line about the company. |
| `segment` | yes | enterprise, mid-market, or sled. |
| `tier_fit` | no | vme, advanced, enterprise, or unknown (the default). |
| `primary_partner_id` | no | Id of a partner. |
| `hpe_owner_email` | no | Email of the HPE owner. |
| `notes` | no | Free text. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Briefs (`briefs.json`)

A JSON list of objects, or an object with a `briefs` list. Each object has these keys.

| Column | Required | Meaning |
| --- | --- | --- |
| `prospect_id` | yes | Id of a prospect already imported. One brief per prospect; a new brief replaces the old one. |
| `sections` | yes | Object with any of what_they_do, virtualization_signals, filings, recent_it_news, tech_stack, broader_trends. Each is a list of items with text, source_url, source_date (YYYY-MM-DD), and confidence (confirmed, reported, inferred). |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Stakeholders (`stakeholders.json`)

A JSON list of objects, or an object with a `stakeholders` list. Each object has these keys.

| Column | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Your id for the stakeholder, unique across all prospects. |
| `prospect_id` | yes | Id of a prospect already imported. |
| `name` | yes | Full name. Work facts only. |
| `title` | no | Job title. |
| `reports_to` | no | Id of the stakeholder this person reports to. |
| `role_in_decision` | no | economic buyer, technical decision maker, champion, influencer, blocker, unknown (the default). |
| `last_contact` | no | YYYY-MM-DD. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

### Deals (`deals.csv`)

| Column | Required | Meaning |
| --- | --- | --- |
| `op_id` | yes | OPE- followed by ten digits. The only key for deals: a row with an existing op_id updates that deal. |
| `prospect_id` | yes | Id of a prospect already imported. |
| `stage` | yes | Sales stage. A stage starting with "Closed" counts as closed; anything else is open. |
| `close_date` | no | YYYY-MM-DD. |
| `hpe_owner_email` | no | Email of the HPE owner. |
| `partner_id` | no | Id of a partner. |
| `as_of` | yes | Date the deal data was pulled, YYYY-MM-DD. |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |
| `verified_at` | no | Date someone last checked the row, YYYY-MM-DD. |
| `updated_by` | no | Who made the file. Defaults to "import". |

<!-- import-columns:end -->

## Check it

```sh
npm run typecheck    # TypeScript, strict
npm test             # unit tests (Vitest)
npm run build        # production build into dist/
npm run screenshots -- m1   # headless Chromium screenshots of the build into docs/screenshots/m1/
```

## Territories

`config/territories.json` is the only place territory membership lives. Each territory has an id, name, color, `legend_count`, and members, where each member is an ISO 3166-2 code (`US-WA`, `CA-BC`) with a `confirmed` flag. Unconfirmed members are hatched on the map. A territory whose member count differs from its `legend_count` shows "8 of 9" in the legend. `default_focus` is the territory the map opens on until a viewer picks their own in Settings.

## Map boundaries

`public/geo/north-america.topo.json` is built by `npm run boundaries` (`scripts/build-boundaries.mjs`) from two Natural Earth files:

- `ne_10m_admin_1_states_provinces_lakes` for US states, DC, and Canadian provinces and territories.
- `ne_10m_admin_0_countries_lakes` for the countries around them, drawn gray.

Source: [Natural Earth](https://www.naturalearthdata.com/), downloaded from the project's repository at `github.com/nvkelso/natural-earth-vector`. License: public domain ("All versions of Natural Earth raster and vector map data found on this website are in the public domain"). The script simplifies the shapes with [mapshaper](https://github.com/mbloch/mapshaper) and fails if any code in `config/territories.json` has no shape. The downloads are cached in `.cache/`, which Git ignores.

## Project layout

- `config/territories.json` holds territories and colors.
- `src/config/` validates the config and answers which territory a region belongs to.
- `src/data/` is the only code that touches storage (`store.ts`) and holds the record types.
- `src/map/` draws the map, the Hawaii inset, and handles zoom.
- `src/ui/` holds the header, legend, and other panels.
- `fixtures/sample/` holds fake records for development, generated by `scripts/sample-fixtures.mjs`.
- `docs/plan.md` is the phase 1 plan, and `docs/progress.md` records what is done and why.
