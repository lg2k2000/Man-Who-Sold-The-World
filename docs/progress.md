# Progress

Read `CLAUDE.md` first, then this file, then `docs/plan.md`.

## Done

- 2026-10-07: The brief went in as `CLAUDE.md`, with the two real names replaced by roles under the brief's own rule. `.gitignore` excludes `data/` from the first commit after the initial README.
- 2026-10-07: `docs/plan.md` holds the phase 1 plan, the stack, and the decisions taken so far.
- 2026-10-07: The owner answered the first questions. Phones are out, so the brief lost its phone, PWA, and 390 by 844 items. PacNorthwest is confirmed as AK, WA, OR, ID, MT, WY, BC, and YT. The reference screenshot put Alberta in Midwest, and the brief's table now says so.

## Next

- The owner makes the repository private in GitHub (Settings, General, Danger Zone, Change repository visibility).
- The owner gives the go on the revised plan. M1 (map) then starts on branch `m1-map`.

## Open questions

- Hosting, so the owner can click around in the app. See "Open items" in `docs/plan.md`. It does not block M1.

## Decisions and why

- The decisions taken so far are listed in `docs/plan.md` under "Decisions". New ones go here with a date.
- 2026-10-07: Natural Earth GeoJSON comes from `raw.githubusercontent.com/nvkelso/natural-earth-vector`, because the cloud environment reaches it and does not reach `naciscdn.org` or `naturalearthdata.com`.
- 2026-10-07: The reference screenshot stays out of Git because its legend names real people. Once the repository is private, M1 commits a crop with the legend blanked out.
