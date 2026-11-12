# Build Log — Transactional & Journey API Integration Kit

Personal portfolio build for the fictional brand QuickStay Hotels. Not employer work. No real credentials anywhere in this repo.

## Day 1 — 2026-11-12 — API foundations

**Built:**
- `README.md` — the QuickStay scenario (a booking system triggering confirmation, pre-arrival, and post-stay messages the moment a reservation changes), the 3-day build plan, the send flow in one pass, and the kit's principles
- `docs/oauth2-server-to-server-flow.md` — OAuth 2.0 server-to-server flow for an SFMC Installed Package: token request/response, `account_id` (MID) targeting, the per-MID caching rule, and a failure table (including the one-auth-retry rule)
- `postman/QuickStay-SFMC-Transactional.postman_collection.json` — Postman collection v2.1: token request (test script saves `access_token` to the environment), create/get for both send definitions, both sends, and a send-status check — 8 requests in Auth / Definitions / Sends folders
- `postman/QuickStay-SFMC-Transactional.postman_environment.json` — environment template with placeholders only; `client_id` / `client_secret` / `access_token` marked as secret-type values with empty values
- `postman/README.md` — import order, variable table, first-run request order, and the house rule never to commit a filled-in environment
- `transactional/README.md` — definitions-first explanation, endpoint table, the `messageKey` convention (`QS-<ReservationId>-CONF/CANC-<seq>`), field discipline for send payloads, and what a `202` does and does not prove
- `transactional/send-definitions/booking-confirmation.json` — send-definition payload, `definitionKey: quickstay-booking-confirmation` (placeholder asset / list / classification keys)
- `transactional/send-definitions/booking-cancellation.json` — send-definition payload, `definitionKey: quickstay-booking-cancellation` (same placeholder pattern)
- `transactional/send-examples/` — one complete fictional send request per definition, each with the expected `202` response shape noted

**Held today:** the Day 1 LinkedIn post draft is written locally (`POST_DAY1_DRAFT.md`, not published to the repo) and held — it publishes on Day 2 (Fri Nov 13), after the LinkedIn restriction lifts. No screenshot is needed for it.

**Next:** Day 2 — Journey API event schema + entry payloads, the pre-arrival / post-stay Journey design, and the SSJS order-lookup / re-send CloudPage.
