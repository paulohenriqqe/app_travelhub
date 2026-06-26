# TravelHub UI Notes

Use these preferences for future TravelHub edits.

- Prefer compact, product-like UI over report-style screens.
- Avoid long explanatory copy. Keep labels short and let interactions be obvious.
- Avoid card-inside-card patterns, heavy gray backgrounds, rounded boxes around simple groups, and excessive shadows.
- Use the compact MG map panel style as the default pattern: simple headings, one-line rows, thin dividers, clear numbers.
- In forms, prefer clean sections separated by lines instead of gray boxes.
- Chips for tags, companions, artists, locations, and similar lists should stay on one horizontal line with overflow, not expand the panel vertically.
- Chip inputs should not show heavy blue focus rectangles; chip removal should be obvious through the chip `x` and Backspace behavior.
- Autocomplete should prefer selecting existing matches; only create when no match exists.
- Provide a clear way to erase typed autocomplete searches.
- Saved autocomplete suggestions should be removable in place when the user creates a mistaken item.
- Charts should use consistent metric colors: blue for trips, orange for days. Bar fill and border should match, with square bar corners.
- Annual travel chart day labels should be orange rectangular labels centered on the line points, matching the reference visual.
- Dashboard charts should feel connected to the results list; clicking a chart item should apply the matching page filter when possible.
- Chart-applied filters should be easy to undo: clicking the same item again or using a nearby compact clear action should remove the filter.
- Keep annual chart day labels subtle and configurable through the local label style constants.
- KPI detail modals should be useful rankings with real counts or durations; avoid zero badges and plain unscored lists.
- Destination day rankings should prefer an explicit spreadsheet column such as `Dias na cidade` / `Dias no destino`; repeated full-trip dates across multiple city rows must not be counted as full days for every city.
- Planning and trip city blocks should expose `Dias na cidade` as an optional compact field and preserve it through conversion to effective trips.
- Location pickers should prefer the offline `assets/data/places` dataset: load `index.json` first, then country city files on demand; do not reintroduce online IBGE/geocoding dependencies for normal country/state/city selection.
- Preserve manual city fallback when a place is missing from the offline dataset, but only set `lat/lng` when a selected offline city record provides coordinates.
- Upcoming trips should show one focused carousel item at a time; avoid peeking cut-off second cards.
- Feedback such as save success should use fading toast alerts instead of persistent inline text when possible.
- Planned items should appear as planned, but should not inflate effective trip counts.
- Use modals for dense plan details and daily itinerary editing instead of expanding the desktop layout downward.
- On mobile, daily itinerary editing should behave like a compact full-screen sheet, not a small centered popup.
- On iPhone/mobile, use high-density layouts: short gaps, low cards, compact buttons, and no persistent explanatory text blocks.
- On iPhone/mobile, the Planning page should stay as compact radar/list view; create/edit planning uses a full-screen sheet with the real form DOM, not an inline long form.
- When a mobile planning sheet opens itinerary editing, preserve the plan editor state and return to the sheet after applying or closing the itinerary.
- Do not duplicate status labels such as "Planejado" in the same row/card/modal.
- Do not mix ranking levels in the map sidebar: UF level shows UFs, city level shows cities/municipalities.
- Keep map instructions inside the `?` helper, not as large persistent copy in the side panel.
- Plan lists should be compact rows with name, city/location, year, and edit/delete actions.
