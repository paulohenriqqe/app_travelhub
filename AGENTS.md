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
- Upcoming trips should show one focused carousel item at a time; avoid peeking cut-off second cards.
- Feedback such as save success should use fading toast alerts instead of persistent inline text when possible.
- Planned items should appear as planned, but should not inflate effective trip counts.
- Use modals for dense plan details and daily itinerary editing instead of expanding the desktop layout downward.
- On mobile, daily itinerary editing should behave like a compact full-screen sheet, not a small centered popup.
- Do not duplicate status labels such as "Planejado" in the same row/card/modal.
- Do not mix ranking levels in the map sidebar: UF level shows UFs, city level shows cities/municipalities.
- Plan lists should be compact rows with name, city/location, year, and edit/delete actions.
