# Dashboard Enhancements Checklist
- [x] Add a persistent todo list with due dates, tap-to-complete, and reversible completion.
- [x] Add calendar view with month/year modes and event range support.
- [x] Add admin filters to show/hide calendar sources (QGenda, meals, school details).
- [x] Extend event storage to support optional end dates/times.
- [x] Refresh 2026–27 middle-school letter days and add Lower Merion JV Bulldogs subscription, retaining earlier hockey history.
- [x] Preserve imported event durations, decode ICS text, omit cancellations, and deduplicate overlapping subscriptions.
- [x] Add rain-glass Automatic/Preview/Off controls with reduced-motion support.
- [x] Add source health indicators, month navigation, rink directions, and filters for all viewers.

## Development and validation

Run `npm ci`, `npm test`, and `npm run check` in `dashboard`. This is a static app with Vercel API functions; keep the existing no-build deployment workflow.
`npm run dev` starts a read-only preview at http://127.0.0.1:8765 using the actual calendar handler and existing production family records. Editing requires the configured Vercel deployment. The older Python preview is retained for reference; use the Node preview for current sources.

School events use the existing Bala Cynwyd subscription. Middle-school letter days use the current Finalsite calendar-manager feed. New hockey includes games and practices published in the supplied Crossbar subscription. Past TeamSnap calendars remain included for history. The 2025–26 gym/library/orchestra reminders expire July 1, 2026; confirm new class assignments before extending them.
