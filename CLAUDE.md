# The Man Who Sold the World: build brief

This file is the standing brief for this repository. Read all of it at the start of every session before you do anything else, then read `docs/progress.md` and `docs/plan.md`.

Work happens in Claude Code cloud sessions with this repository attached, never on the owner's machine.

## Who this is for and why

- I'm the owner of this repository. I sell HPE Morpheus software (VM Essentials, Advanced, and Enterprise) as the replacement for VMware. HPE sells through channel partners, so my job runs through HPE account teams, HPE specialists, and partner reps rather than direct sales.
- HPE's fiscal year 2027 starts on 1 November 2026. My FY27 territory is PacNorthwest: Alaska, Washington, Oregon, Idaho, Montana, Wyoming, British Columbia, and the Yukon. The Morpheus specialist for the 4 Corners territory will use the app for his own territory.
- The app exists so we know who to call. For any state or province it should show who at HPE covers it, which partners work there, which companies are prospects, what we know about each prospect, and who the people inside each prospect are.
- It is also a small CRM (decided 2026-10-08): companies, the contacts at them, and the deals with them, with dollar amounts. My manager keeps all of his deals in an Excel spreadsheet, and it has to go in with little effort and update the app each time he sends a new one.
- It is a web app I use in a browser on my laptop, with the map as the main screen. Phones are out of scope (decided 2026-10-07).

## The map

- The map shows North America the way the reference map does. The US and Canada are drawn with Alaska in its true position, every state and province is colored by its FY27 territory, borders are thin and white, and other countries are light gray. Hawaii gets a small inset, because the reference map leaves it off.
- The reference map only shows who has which territory; the app's map is more detailed (decided 2026-10-08). Over the territory colors it draws cities and towns, highways, rivers and lakes, metro areas, US county lines, and state and province names, from free data bundled with the app. More detail appears as the viewer zooms in, and a layers menu turns each kind on or off.
- The app opens focused on the viewer's territory, and in phase 1 that is a setting that defaults to PacNorthwest. The rest of the continent stays visible but dimmed. One button zooms out to all of North America, and a territory picker jumps to any territory.
- A legend lists every territory with its color, its team, and its count of states and provinces.
- Territories are data. They change every fiscal year, so no component may hardcode which state belongs to which territory or who is on which team. Membership comes from `config/territories.json`, and team members come from the people import.
- A territory editor lets me select a state or province and move it to another territory. It shows a warning on any territory whose member count does not match its `legend_count`, and it can export the corrected `territories.json` for me to commit.

## What the app does

- Hovering a territory shows a card. The card lists the territory team, other HPE people who cover states in that territory grouped by role, the top partners, the number of companies, the number of open deals, and the open pipeline in dollars.
- Selecting a state or province zooms to it and shows one pin per company at its headquarters location. Partners have no pin; they show the states they work in.
- Selecting a pin opens a panel with four tabs: Brief, Contacts, Coverage, and Deals. The panel slides in from the side.
- A filter bar narrows pins by territory, tier fit (VME, Advanced, Enterprise, unknown), partner, and whether the account has an open deal.
- An account covered by people in three or more distinct account coverage roles, not counting the EAM, gets a visual highlight and its own filter.
- A search box finds any company, contact, deal, or HPE person and jumps to it.
- Deals, Companies, Contacts, and HPE team views list every record with edit forms. They are sortable tables. Deals shows dollar totals by stage.

## HPE roles

- Territory team roles are Morpheus specialist and OpsRamp specialist. One person can sit on more than one territory team.
- Account coverage roles are EAM (executive account manager), storage specialist, compute specialist, networking specialist (Aruba or Juniper), GreenLake specialist, Zerto specialist, SLED (state, local, and education) overlay, and other.
- One person can cover several states and many accounts. A SLED specialist can also cover enterprise accounts.

## Data model

Every table carries `source` (free text or URL), `verified_at` (date), and `updated_by`. Territories live in the config, not in these tables.

- `companies` holds name, type (prospect, customer, partner, other), website, HQ city, state or province (may be empty until known; a company without one has no pin), lat, lng, industry, a one-line description, segment (enterprise, mid-market, SLED, or not set), tier fit, primary partner (a partner company), HPE owner, and notes. Partners also hold the states they work in, `has_done_vme`, and `has_done_morpheus_enterprise` (yes, no, unknown).
- `contacts` holds company, name, title, email, phone, `reports_to` (another contact at the same company), `role_in_decision` (economic buyer, technical decision maker, champion, influencer, blocker, unknown), last contact date, and notes. Store work facts only. Render the Contacts tab as an org tree built from `reports_to`.
- `deals` holds `op_id`, name, company, stage, amount in US dollars, close date, forecast category, HPE owner (or the owner's name as text when they are not in the HPE team), partner, contacts on the deal, next step, notes, and an `as_of` date. The `op_id` is OPE- followed by ten digits and unique when present; a deal without one is keyed on its company and name until an import brings one.
- `people` is the HPE team: name, role, email, territories, states, and notes. Email is optional (decided 2026-10-08), so a team member can be added by name before anyone knows their email; people are keyed by an id that stays the same when the email arrives.
- `coverage` links an HPE person to a company they cover. The overlap highlight is computed from this table.
- `briefs` holds one brief per company with these sections: what they do, virtualization signals, filings or public records, recent IT news, tech stack, and broader trends. Each section is a list of items, and each item has text, `source_url`, `source_date`, and `confidence` (confirmed, reported, inferred).

## Data rules

- Ship with an empty database. Never invent a person, contact, company, deal, partner, or territory assignment. Empty states should look intentional and say what is missing.
- Real data never goes into the repository. Import files and anything the app stores live outside Git, and `data/` is listed in `.gitignore` from the first commit. The only real-world data committed is `config/territories.json`, which holds geography and colors and no names.
- For UI development, use fixtures with obviously fake names ("Sample Co 1", "Sample Person A") and an `is_sample` flag. When any sample row is loaded, show a banner saying the page contains sample data.
- Imports take Excel workbooks, CSV, rows pasted from a spreadsheet, and JSON (briefs are JSON only). Columns are matched by name and common alternatives, the owner can change any match, and the app remembers the matching per spreadsheet layout. Validate on import, preview the changes, and report every rejected row with the reason before anything is saved.
- Deals match on op ID, then on company and deal name. Companies match by name with case, punctuation, and endings such as Inc or LLC ignored, and a name with no match becomes a new company that the preview lists. Contacts match by email or name at their company. An import never blanks a stored field.
- A company without lat and lng pins at its HQ city when the towns bundled with the map include it, otherwise at its state's or province's center, with a "location unverified" marker either way. (Claude changed this on 2026-10-08 so imported deals spread across their towns instead of stacking at the state center; the owner can reverse it.)
- Every brief item shows its source link and date. Items marked inferred look visibly different from confirmed ones.
- Territory members marked unconfirmed get a subtle hatch on the map until I confirm them in the editor.

## Tech

- Use React, Vite, and TypeScript, with d3-geo for drawing. If you think another stack fits better, say why in the plan.
- Get state and province boundaries from Natural Earth admin-1 data (public domain), simplify them, and commit them as a static TopoJSON file. Record the source and license in the README. Use no tile server and no map API key.
- It is a web app for a laptop browser. Phase 1 has no progressive web app, service worker, or phone layout.
- Put all storage behind one data module. In phase 1, store data in the browser (IndexedDB) and load it by importing files. Swapping in a hosted database later should change only that module.
- Use HPE green #01A982 and navy #425563 for the app's own chrome, and take territory colors from the config. Support light and dark mode.
- The map should stay smooth on a laptop with every state and province drawn and a few hundred pins.

## How we work

- Start by writing a plan for milestones 1 through 5, including the stack you propose and anything in this brief you think is wrong or missing. Then stop for my approval.
- After I approve the plan, work through the milestones in order without checking in, except for the items under "Ask me first."
- Use one branch and one pull request per milestone. Each PR description says what changed, how you verified it, what is still open, and includes the screenshots.
- Verify before every PR. Run the type check, unit tests for import validation and territory logic, and the production build. Then run the app in a headless browser with sample data, take screenshots at 1440 by 900 in light and dark mode, look at them, and fix what is wrong before you open the PR. Commit the screenshots to `docs/screenshots/<milestone>/`. If you cannot install a headless browser in this environment, say so in the PR and list what I should check by hand.
- Keep `docs/progress.md` current with what is done, what is next, open questions, and the decisions you made and why. Each cloud session starts fresh, so this file and CLAUDE.md are the only memory between sessions.
- If two parts of this brief conflict, or the brief conflicts with something you find, ask me instead of picking one.
- If the same step fails twice, stop and tell me which step failed and what you tried.
- For anything this brief does not cover, use your judgment and record the call in `docs/progress.md`.

## Ask me first

- Ask before you deploy anything, create a hosted account or service, add authentication, add a paid dependency, or call any external API beyond package registries and the one-time boundary data download.
- Ask before you commit any file from `data/` or any file containing a real person's name.
- If the network blocks the boundary data download, stop and tell me the exact domain to allow. I can add it to the cloud environment's network settings.

## Milestones for phase 1

1. Map. The North America map renders with territory colors from the config, the legend, the Hawaii inset, the default focus on PacNorthwest, the zoom-out button, and the territory picker, in light and dark mode. This is done when the 1440 by 900 screenshot reads like the reference map.
2. Interactions. Territory cards work on hover, state and province zoom works, sample pins render, the pin panel opens with all four tabs, and the filters, the overlap highlight, and search all work on sample data.
3. Data. The data module, CSV and JSON imports with validation and a rejected-row report, empty states, the sample data banner, and the territory editor with count warnings and export all work.
4. People and partners. Both views work with edit forms and sorting.
5. Hardening. Territories and pins are reachable by keyboard, map regions and pins have screen reader labels, colors meet contrast guidelines against the background, error states are handled, and the README explains how to run the app and lists the columns for each import file. Finish with a full screenshot pass.

## Not in phase 1

- Writing research briefs or stakeholder maps. They arrive as JSON files I produce elsewhere. Build the import and display only.
- Pulling data from Salesforce, Power BI, or any HPE system.
- Hosting, logins, and sharing with the 4 Corners specialist.
- An MCP server so any LLM can update deals, people, and the map. It needs hosting, a hosted database, and a login. When the app is further along, the owner wants Neon for the database and Railway for hosting (said 2026-10-08); building it still waits for the owner's go-ahead.

## Reference: FY27 territories

I read these from a phone screenshot of HPE's FY27 Sales Rep Territory Coverage map on 7 October 2026. Colors are approximate, matched by eye. Seed `config/territories.json` from this table, mark every member in an unconfirmed row as unconfirmed, and leave a territory short when the table says a slot is unclear. Do not fill a gap by guessing.

| Territory | Color | Legend count | Members | Status |
|---|---|---|---|---|
| Southwest | #2D7DD2 | 2 | US-CA, US-NV | Confirmed by count |
| PacNorthwest | #E8693A | 9 | US-AK, US-WA, US-OR, US-ID, US-MT, US-WY, CA-YT, CA-BC; the legend says 9 and the ninth is unknown | Confirmed by the owner on 2026-10-07 |
| 4 Corners | #8C5A2E | 4 | US-AZ, US-CO, US-NM, US-UT | Confirmed by count |
| TOLA | #22B07D | 4 | US-TX, US-OK, US-LA, US-AR | Confirmed by count |
| Midwest | #EBA21B | 10 | CA-NT, CA-NU, CA-AB, CA-SK, CA-MB, US-ND, US-SD, US-NE, US-KS, US-MO (Alberta read from the reference screenshot) | Unconfirmed |
| Ohio Valley | #4E3BA6 | 14 | CA-ON, US-MN, US-IA, US-WI, US-MI, US-IL, US-IN, US-OH, US-KY, US-WV, US-PA, US-VA, US-MD, US-DE | Unconfirmed |
| New York and Fed | #E07BB5 | 2 | US-NY, US-NJ | Unconfirmed |
| Southeast | #E04B4B | 7 | US-AL, US-FL, US-GA, US-MS, US-NC, US-SC, US-TN | Unconfirmed |
| Northeast | #17998F | 11 | US-CT, US-MA, US-ME, US-NH, US-RI, US-VT, CA-NB, CA-NL, CA-NS, CA-PE, CA-QC | Unconfirmed |

- The reference map gives each territory a two-person Morpheus team and one OpsRamp specialist. Names come from my people import and never go in this file.
- Hawaii does not appear on the reference map. Draw it unassigned until the config says otherwise.
- DC is in no row. Leave it unassigned.
- The background is a light blue-gray near #EEF1F4, and land outside the US and Canada is a light warm gray near #E5E3DF.
