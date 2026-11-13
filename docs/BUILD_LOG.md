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

## Day 2 — 2026-11-13 — Real-time journeys

**Built:**
- `journey-api/README.md` — API-event entry vs schedule/batch entry, the two events (`QS_PreArrival_Event`, `QS_PostStay_Event`), the Journey endpoint table (`POST /interaction/v1/eventDefinitions`, `POST /interaction/v1/events`), the entry call in one pass (201 + `eventInstanceId` = injected, not sent), and the field-discipline rule: the event schema reuses Day 1's exact reservation field set plus `ReservationStatus` / `EventVersion`
- `journey-api/api-event-definition.json` — both event definitions as create payloads, plus the full `QS_Journey_Entry` entry-DE schema (sendable on `ContactKey`; primary key `ContactKey` + `ReservationId` + `EventVersion`, so an updated reservation re-enters as a new version instead of colliding)
- `journey-api/entry-payloads/pre-arrival-entry.json` — complete fictional entry for reservation QS-84213 (the reservation Day 1 confirmed), `EventVersion` 1, `ReservationStatus` Confirmed
- `journey-api/entry-payloads/post-stay-entry.json` — the matching check-out entry for QS-84213 (`EventVersion` 2, `CheckedOut`)
- `journey-api/entry-payloads/cancellation-status-update.json` — the cancellation signal payload (`QS_Cancellation_Signal`), timestamps and `CancellationReference` CANC-55190 matching Day 1's cancellation send example
- `journey-api/journey-design.md` — `QuickStay_PreArrival_v1` (Wait by Attribute to CheckInDate −3 days; Journey Data version split at entry; Contact Data cancellation split immediately before the send, with the Journey-vs-Contact-Data reasoning), `QuickStay_PostStay_v1` (1-day wait, feedback email, engagement split, one reminder, exit), and `QuickStay_Cancellation_Signal` (one-step Update Contact Journey) — plus the stated honest limit that a cancellation exit is only as timely as the pre-send split's position, and sandbox testing notes
- `cloudpages/order-lookup.ssjs` — the full CloudPage: AMPscript validates the booking reference format (`^QS-[0-9]{4,6}$`), looks the reservation up by reference + email in one `LookupRows` call, returns a single generic failure message (no reference-existence leak), renders the stay, and — for active bookings only — an SSJS re-send block that throttles from `QS_Resend_Log` (1 per 15 min / 3 per day), takes a server-to-server token, posts to Day 1's `quickstay-booking-confirmation` definition with a new `QS-<id>-RESEND-<seq>` messageKey, logs the re-send before reporting success, and never shows the guest a raw API error
- `cloudpages/README.md` — the page's flow diagram, the six design decisions (pair-as-credential, one generic failure, AMPscript-looks-up/SSJS-calls, re-send = new event, throttling, no in-page token cache and why), the two DEs it expects, and honest limits (code-reviewed, not run against a live MID; lookup is not an account login)
- `README.md` — updated to Day 2 built: build table, repo layout, status

**Published today:** the held Day 1 LinkedIn post ("Transactional email is an API product, not a campaign") — held since Nov 12 for the LinkedIn restriction, which lifted today at 6:49 AM PST. The Day 2 post angle ("The fastest journey entry is an event, not a schedule") is deferred to Day 3 (Sat Nov 14) so the series stays in order.

**Next:** Day 3 — reliability: logging DE + SSJS error-handling patterns, Event Notification Service callback spec, retry/idempotency notes, transactional deliverability checklist, README sequence diagrams, and the wrap-up.
