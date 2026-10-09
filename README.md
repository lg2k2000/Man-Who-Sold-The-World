# Territory Coverage

A web app for a laptop browser that shows HPE's FY27 sales territories on a map of North America, with a small CRM behind it: companies (prospects, customers, and partners), the contacts at them, and the deals with them, plus the HPE team and who covers which account.

The app ships with an empty database. Data comes only from files the owner imports, or from a snapshot published with the owner's private copy of the app, and it stays in the browser. Nothing real is committed to this repository except `config/territories.json`, which holds geography and colors.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run dev -- --open
```

Open `http://localhost:5173/?sample=1` to load the fake sample data from `fixtures/sample/` into memory. A banner says so whenever sample rows are loaded. `?sample=stress` triples the sample companies (600 pins) to check drawing speed.

## Using the map

- Hover a territory to see its card: the territory team, other HPE people covering its states by role, top partners (by the accounts they work there, as primary partner or on a deal), and counts of companies, open deals, and open pipeline dollars. The card holds still where the pointer entered the territory, switches to another territory only after the pointer rests there briefly, and stays open while the pointer is on it, so its names open that person or partner and its buttons show the territory or zoom to the state.
- Click a state or province to zoom to it and show its companies as pins. Every company with a state gets a pin except partners. A company without coordinates sits at its HQ city when the bundled towns include it, otherwise at the state's center, with a dashed pin marked "location unverified"; one without a state has no pin until someone adds it. Hovering a pin shows its open deals, their total, and the HPE owners on them.
- Click a pin to open the side panel with Brief, Contacts (an org chart from who reports to whom), Coverage, and Deals with amounts.
- The filter bar narrows pins by territory, tier fit, partner (as primary partner or on a deal), open deal or open pipeline of at least $25K, $50K, $100K, or $250K, and accounts covered by three or more account coverage roles (EAM excluded), which also get a green ring.
- Press `/` to search companies, contacts, deals (by name or op ID), and the HPE team. Picking a company frames it on the map and opens its panel; picking a deal opens it in Deals.
- At the full continent view each state shows a company count; pins appear once a territory or state is chosen or the map is zoomed in.
- The map draws cities and towns, highways, rivers and lakes, metro areas, US county lines, and state and province names over the territory colors. More appears as you zoom in: big metros at the continent view, state capitals and regional cities at territory zoom, and towns of 5,000 or more people (1,000 or more in Alaska and the northern territories) at state zoom and closer. County lines show from state zoom, smaller highways and rivers a little before. Labels never overlap; a name moves to the side of its dot clear of the pins when it can.
- The layers button above the zoom buttons turns each kind of detail on or off. The choice is saved in this browser.

## Deals, companies, contacts, and the HPE team

- **Deals** lists every deal with its company, stage, amount, close date, forecast category, HPE owner, partner, territory, and op ID. It opens on open deals; tiles above the table total each stage in dollars and narrow the table to it, and the heading totals what is shown. Filter by territory, owner, or text.
- **Companies** lists prospects, customers, and partners, with tabs by type, open deals, open pipeline, and contacts. Partners carry the states they work in and whether they have done VME and Morpheus Enterprise.
- **Contacts** lists the people at those companies with title, email, phone, role in the decision, and last contact.
- **HPE team** lists HPE people: territory teams and account coverage.
- Click a column header to sort (again to reverse), and click a row to open its edit form beside the table. The forms check fields with the same rules as an import. Deleting a record says first what else goes with it: a company takes its contacts, deals, coverage, and brief, and is cleared as anyone's partner. Set your name in Settings so edits record who made them in `updated_by`.
- A deal's key is its op ID. A deal without one (not yet in Salesforce) is keyed on its company and name, and takes the op ID the first time an import brings one. A deal owner who is not in the HPE team is kept as a name.

## Editing territories

Click **Edit** in the legend. Click any state or province to move it to another territory, unassign it, or mark it confirmed. The bar at the top lists every territory whose member count differs from its legend count (you can change the legend count there) and every change in the draft. The draft stays in this browser until you click **Export territories.json**; commit the exported file over `config/territories.json`. If the committed file changes while you have a draft, the map asks whether to keep the draft or use the new file.

## Keyboard and screen readers

- The first Tab stop is "Skip to the map" (or "Skip to content" on other views).
- On the map, Tab lands on one state or province; the arrow keys move through all of them in legend order, Home and End jump to the first and last, and Enter zooms in. Focusing a region shows its territory card. Escape hides the card or closes the side panel.
- The next Tab stop is the pins. The arrow keys move between them by name and Enter opens one. The panel takes focus when it opens and gives it back when it closes; the arrow keys move between its tabs.
- Every region is labeled with its name, territory, whether it is confirmed, and its prospect count. Every pin is labeled with the company, city, and whether its location is unverified, it has 3 or more coverage roles, or it has an open deal.
- The `+` and `−` buttons zoom without a mouse wheel.
- Territory colors come from the config and several are pale, so a darker coastline outlines the US and Canada and keeps every territory's edge at 3:1 or more against the background in both themes. Text meets 4.5:1. `tests/contrast.test.ts` checks the theme colors; `npm run a11y` runs axe-core on every view in both themes and walks the map by keyboard.

## When something fails

- If the map boundaries do not load, the map says why and offers "Try again".
- If the map detail (cities, roads, water, counties) does not load, the territory map, pins, and data still work, and the layers menu says the detail is missing.
- If the browser blocks storage (a private window, or site data turned off), the app keeps working in this tab's memory and says so on every page; "Export everything" keeps a copy.
- A storage error while saving (for example, the disk is full) is reported in plain words and nothing is changed.
- If `config/territories.json` fails its checks, the app lists the problems instead of drawing a wrong map.
- If a page crashes, the app offers a reload and a backup of the data.

## Importing data

Open **Data** in the header, then **Choose files** (Excel `.xlsx`, CSV, or JSON) or **Paste rows** (select rows in Excel or Google Sheets, header row included, and paste).

1. The app picks the table from the file or sheet name (`Q1 Pipeline.xlsx` goes to Deals, `hpe-team.csv` to the HPE team) or from the headers, and you can change it. A workbook with several sheets lets you pick one. A title row above the headers is skipped; the header row number can be changed.
2. Each column in the file is matched to a column of the table by its name or a common alternative ("Opportunity ID", "Account Name", "Close Date", "Opportunity Owner", "Billing State/Province"). A column holding op IDs matches op_id whatever it is called. Change any match by hand, or set a column to Skip. The app remembers the matching for that spreadsheet layout, so next week's export of the same report goes straight through.
3. The preview says how many rows are new, updated, and rejected, lists every rejected row with its row number and reason, and lists the companies and contacts the file adds and any names it matched to a record spelled differently. Nothing is saved until you click **Import**.

How rows are matched:

- Companies match by name, ignoring case, punctuation, a leading "The", and endings such as Inc, LLC, Corp, and Company: "SAMPLE CO B, INC." updates "Sample Co B". A name with no match becomes a new company: a prospect when a deal or contact names it, a partner when it is named as a partner. A new company from a deal sheet takes the state and city on the row, so it gets a pin.
- Deals match by op ID, then by company and deal name. A row needs one or the other.
- Contacts match by email or name at the same company.
- HPE team members match by email, or by name when the row has no email, so a team can go in by name and get its emails later. An owner or coverage row can name a person by email or by name.
- HPE owners match by email or by name as it appears in the HPE team. An owner who is not in the team yet is kept as text and links up when the team import brings them.
- An import adds and updates; it never blanks a field. A column the file does not have, or an empty cell, leaves the stored value alone. Tick "Replace all" to swap a whole table instead.

Dates can be `2026-10-15`, `10/15/2026`, `15-Oct-2026`, or spreadsheet dates. Amounts can be `1250000`, `$1,250,000`, or `1.25M`, in US dollars. States can be `WA`, `US-WA`, or `Washington`. Multi-value cells (roles, territories, states, contacts) are separated by semicolons.

`fixtures/import-examples/` holds a fake example of each import, plus `manager-pipeline.xlsx`, laid out like a Salesforce pipeline report (`npm run example-workbook` rebuilds it).

A copy of the app can be published with a snapshot: a `snapshot.json` next to `index.html` that holds import files (`npm run snapshot` packs them; see `scripts/make-snapshot.mjs`). A browser that holds no real data loads it when the app opens, and the Data page can load it again over existing data, the way an import does. The repository never holds a snapshot, because it carries real data; it goes only into the owner's private published copy.

Data lives in this browser's IndexedDB and never leaves it. "Export everything" saves one JSON backup file; "Restore from file" loads one, including backups made by earlier versions. Keep import files and backups in `data/` (Git ignores it) or outside the repository.

<!-- import-columns:start -->

### Companies

An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `name` | yes | Company name. | company, company name, account, account name, customer |
| `id` | no | Your id for the company, such as acme-seattle. Leave it empty and the row matches an existing company by name, or gets an id made from the name. | company id, prospect id, partner id |
| `type` | no | prospect (the default), customer, partner, or other. | company type, account type, relationship |
| `website` | no | Web address. | url, web, domain |
| `hq_city` | no | Headquarters city. | city, hq city, billing city, headquarters city |
| `state` | no | Headquarters state or province: WA, US-WA, or Washington. A company without one has no pin on the map. | province, state province, hq state, billing state, billing state province, headquarters state |
| `lat` | no | Headquarters latitude. Leave lat and lng empty to pin at the HQ city, or at the state center when the city is unknown, as "location unverified". | latitude |
| `lng` | no | Headquarters longitude, negative in North America. | lon, long, longitude |
| `industry` | no | Free text. | vertical, sector |
| `description` | no | One line about the company. | about, summary |
| `segment` | no | enterprise, mid-market, or sled. |  |
| `tier_fit` | no | vme, advanced, enterprise, or unknown (the default). | tier, fit |
| `primary_partner` | no | Partner company by name or id. A partner not in Companies yet is added as one. | primary partner id, partner, partner account, reseller |
| `hpe_owner` | no | HPE owner, by email or by name as it appears in the HPE team. | hpe owner email, owner, account owner, eam |
| `states` | no | Partners: the states and provinces they work in, separated by semicolons. | coverage states, states covered, territory states |
| `has_done_vme` | no | Partners: yes, no, or unknown (the default). | done vme, vme |
| `has_done_morpheus_enterprise` | no | Partners: yes, no, or unknown (the default). | done morpheus enterprise, morpheus enterprise |
| `notes` | no | Free text. | note, comments |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

### Contacts

An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `name` | yes | Full name. Work facts only. | contact, contact name, full name |
| `company` | yes | The company they work at, by name or id. A company not in Companies yet is added as a prospect. | company id, prospect id, account, account name, company name, organization |
| `title` | no | Job title. | job title, role, position |
| `email` | no | Work email. | email address, e mail |
| `phone` | no | Phone number. | phone number, mobile, cell, direct |
| `id` | no | Your id for the contact. Leave it empty and the row matches the contact with the same email or name at the same company. | contact id |
| `reports_to` | no | Who they report to: a contact id or a name at the same company. The Contacts tab draws the org chart from it. | manager, reports to |
| `role_in_decision` | no | economic buyer, technical decision maker, champion, influencer, blocker, unknown (the default). | decision role, buying role |
| `last_contact` | no | Date of the last conversation. | last contacted, last touch |
| `notes` | no | Free text. | note, comments |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

### Deals

An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `op_id` | no | OPE- followed by ten digits. A row with a known op ID updates that deal. A row without one matches the deal with the same name at the same company, or adds a new deal. | op id, opportunity id, opp id, opportunity number, ope, ope id, ope number |
| `name` | no | Deal name. A row needs an op ID or a deal name. | deal, deal name, opportunity, opportunity name, opp name, title |
| `company` | yes | The customer or prospect, by name or id. A company not in Companies yet is added as a prospect. | account, account name, customer, customer name, company name, end user, end customer, prospect, prospect id, company id, client |
| `stage` | yes | Sales stage. A stage starting with "Closed" counts as closed; anything else is open. | sales stage, deal stage, opportunity stage, status |
| `amount` | no | Deal value in US dollars: 1250000, $1,250,000, or 1.25M. | value, deal value, total, total value, tcv, acv, revenue, amount usd, opportunity amount, deal size, price, total amount |
| `close_date` | no | Expected or actual close: 2026-10-15, 10/15/2026, or a spreadsheet date. | close, close date, expected close, expected close date, closing date, est close date, estimated close date |
| `forecast_category` | no | Free text, such as Pipeline, Upside, or Commit. | forecast, forecast category, category |
| `hpe_owner` | no | HPE owner, by email or by name as it appears in the HPE team. A name not in the team is kept as text. | hpe owner email, owner, opportunity owner, deal owner, account owner, rep, sales rep, account manager, am |
| `partner` | no | Partner company by name or id. A partner not in Companies yet is added as one. | partner id, partner name, partner account, primary partner, reseller, channel partner, var, distributor |
| `contacts` | no | Contacts on the deal at its company, by name or email, separated by semicolons. New names are added to Contacts. | contact, primary contact, contact name |
| `next_step` | no | Free text. | next step, next steps |
| `notes` | no | Free text. | note, comments, comment, description |
| `as_of` | no | Date the deal data was current. Defaults to the day of the import. | as of, as of date, last modified, last modified date, snapshot date, updated |
| `state` | no | The company's state or province. Used when the deal adds a new company, so it gets a pin. | account state, billing state, billing state province, province, customer state |
| `city` | no | The company's city, for a new company. | account city, billing city, customer city |
| `id` | no | The app's own key for the deal, in backups. Leave it empty. |  |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

### HPE team

An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `name` | yes | Full name. | full name |
| `email` | no | Work email. Optional: a row without one matches the person with the same name, and an email added later fills it in. Re-importing the same email updates the person. | email address |
| `role` | yes | One or more of morpheus, opsramp, eam, storage, compute, networking, greenlake, zerto, sled, other, separated by semicolons. Labels such as "Morpheus specialist" also work. | roles, title |
| `specialty` | no | aruba or juniper, for networking specialists. |  |
| `territories` | no | Territory teams the person sits on, by id (pacnorthwest) or name (PacNorthwest), separated by semicolons. | territory |
| `states` | no | States and provinces the person covers, such as WA; OR; BC or US-WA; US-OR; CA-BC. | coverage states |
| `notes` | no | Free text. |  |
| `id` | no | The app's own key for the person, in backups. Leave it empty. |  |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

### Coverage

An Excel workbook, a CSV file, rows pasted from a spreadsheet, or a JSON list. The column names below match automatically, and so do the other names listed with each; any other column can be matched by hand.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `person` | yes | Someone in the HPE team, by email or by name. | person email, person name, email, hpe person, name |
| `company` | yes | A company already in Companies, by name or id. | company id, prospect id, account, account name |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

### Briefs

A JSON list of objects, or an object with a `briefs` list. Each object has these keys.

| Column | Required | Meaning | Also matches |
| --- | --- | --- | --- |
| `company` | yes | A company already in Companies, by name or id. One brief per company; a new brief replaces the old one. | company id, prospect id |
| `sections` | yes | Object with any of what_they_do, virtualization_signals, filings, recent_it_news, tech_stack, broader_trends. Each is a list of items with text, source_url, source_date (YYYY-MM-DD), and confidence (confirmed, reported, inferred). |  |
| `source` | no | Where the row came from, as text or a URL. Defaults to the file name. |  |
| `verified_at` | no | Date someone last checked the row. | verified, verified on |
| `updated_by` | no | Who made the file. Defaults to "import". |  |

<!-- import-columns:end -->

## Check it

```sh
npm run typecheck    # TypeScript, strict
npm test             # unit tests (Vitest)
npm run build        # production build into dist/
npm run screenshots -- m7   # headless Chromium screenshots of the build into docs/screenshots/m7/ (sets: m1 to m7)
npm run a11y         # axe-core scan of every view in both themes, plus a keyboard walk (needs a build)
npm run format       # Prettier
```

## Territories

`config/territories.json` is the only place territory membership lives. Each territory has an id, name, color, `legend_count`, and members, where each member is an ISO 3166-2 code (`US-WA`, `CA-BC`) with a `confirmed` flag. Unconfirmed members are hatched on the map. A territory whose member count differs from its `legend_count` shows "8 of 9" in the legend. `default_focus` is the territory the map opens on until a viewer picks their own in Settings.

## Map boundaries

`public/geo/north-america.topo.json` is built by `npm run boundaries` (`scripts/build-boundaries.mjs`) from two Natural Earth files:

- `ne_10m_admin_1_states_provinces_lakes` for US states, DC, and Canadian provinces and territories.
- `ne_10m_admin_0_countries_lakes` for the countries around them, drawn gray.

Source: [Natural Earth](https://www.naturalearthdata.com/), downloaded from the project's repository at `github.com/nvkelso/natural-earth-vector`. License: public domain ("All versions of Natural Earth raster and vector map data found on this website are in the public domain"). The script simplifies the shapes to 30% of their points with [mapshaper](https://github.com/mbloch/mapshaper) and fails if any code in `config/territories.json` has no shape. The downloads are cached in `.cache/`, which Git ignores.

## Map detail

`public/geo/detail.topo.json` (about 3 MB, 0.7 MB compressed) is built by `npm run detail` (`scripts/build-detail.mjs`). The app loads it after the territory map has drawn.

| Layer | Source | License |
| --- | --- | --- |
| Cities | Natural Earth `ne_10m_populated_places_simple`, US and Canada, with its scale rank and capital status | Public domain |
| Towns | [GeoNames](https://www.geonames.org/) places of 5,000 or more people (1,000 or more in Alaska, Yukon, Northwest Territories, and Nunavut), from the [`all-the-cities`](https://www.npmjs.com/package/all-the-cities) package. Towns Natural Earth already lists are dropped. | Data CC BY 4.0 (attribution shown in the layers menu); package MIT |
| Highways | Natural Earth `ne_10m_roads`, US and Canada, ferries left out, split into major (interstates, freeways, beltways) and other highways | Public domain |
| Rivers | Natural Earth `ne_10m_rivers_lake_centerlines` | Public domain |
| Lakes | Natural Earth `ne_10m_lakes` | Public domain |
| Metro areas | Natural Earth `ne_10m_urban_areas` | Public domain |
| US counties | [`us-atlas`](https://github.com/topojson/us-atlas) `counties-10m.json`, built from US Census Bureau cartographic boundary files | Package ISC; Census data public domain |

Both packages are dev dependencies used only by the build script; neither ships in the app.

## Project layout

- `config/territories.json` holds territories and colors.
- `src/config/` validates the config and answers which territory a region belongs to.
- `src/data/` is the only code that touches storage (`store.ts`, `idb.ts`) and holds the record types (`types.ts`), name matching (`names.ts`), and the move from the first version's tables (`migrate.ts`).
- `src/import/` reads spreadsheets, CSV, JSON, and pasted rows, matches columns, finds the records rows name (`resolve.ts`), and checks every row (`tables.ts`).
- `src/map/` draws the map, the Hawaii inset, and handles zoom.
- `src/ui/` holds the views, forms, panels, and the import screen.
- `fixtures/sample/` holds fake records for development, generated by `scripts/sample-fixtures.mjs`.
- `docs/plan.md` is the phase 1 plan, and `docs/progress.md` records what is done and why.
