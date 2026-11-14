# Transactional & Journey API Integration Kit

**Builder:** Vikas Sandireddy — Salesforce Marketing Cloud practitioner (7+ years overall, 5+ years hands-on SFMC)

**What this is:** A personal portfolio / practice build. Not employer work. No employer data, no employer systems, no real customer data, and no real credentials anywhere in this repo — templates and placeholders only.

**Demo brand:** *QuickStay Hotels* — a fictional hotel brand. All guests, reservations, properties, and addresses in this repo are invented for this kit.

**Skills shown (real skills only):** SFMC REST / SOAP concepts, Transactional Messaging API, OAuth 2.0 server-to-server auth, SSJS and AMPscript, ENS callbacks, MC Connect awareness. No certifications are claimed in this repo.

## The scenario

QuickStay's booking system knows the moment a reservation changes. Marketing Cloud has to react in that same moment — not in the next hourly automation, and not in tomorrow's batch:

1. **A guest books** → a booking confirmation goes out straight away, with the stay details from *that* reservation
2. **Check-in approaches** → a pre-arrival message goes out with property, arrival, and stay information
3. **The stay ends** → a post-stay message goes out asking for feedback and closing the loop
4. **A guest cancels** → a cancellation confirmation goes out, and any pre-arrival messaging for that reservation must stop

That means the booking system is the trigger, not a schedule. Every message in this kit is started by an API call or an API event carrying the reservation data with it. If the API call fails, there is no send to fall back on — which is why auth, payload shape, and error handling are the product here, not an afterthought.

```
 Booking system                Marketing Cloud Engagement
 ──────────────                ──────────────────────────
 Reservation created ───┐
 Reservation updated ───┼─►  OAuth 2.0 token (server-to-server)
 Reservation cancelled ─┘         │
                                  ▼
                        Transactional Messaging API
                        send definitions (Day 1):
                          • booking confirmation
                          • booking cancellation
                                  │
                                  ▼
                        Journey API events (Day 2):
                          pre-arrival + post-stay journeys
                        entered in real time, per reservation
                                  │
                                  ▼
                        Reliability (Day 3):
                        logging, retries, idempotency,
                        Event Notification Service callbacks
```

## Build plan (3 days)

| Day | Focus | Artefacts |
|---|---|---|
| **Day 1 — API foundations** | OAuth, Postman setup, Transactional send definitions | This README, `docs/oauth2-server-to-server-flow.md`, `postman/`, `transactional/` |
| **Day 2 — Real-time journeys** | API event schema + entry payloads, Journey design, SSJS order-lookup / re-send CloudPage | `journey-api/`, `cloudpages/` |
| **Day 3 — Reliability** | Logging DE + SSJS error handling, ENS callback spec, retry / idempotency notes, transactional deliverability checklist | `reliability/` |

All three days are built. The kit is complete.

## Repo layout (complete)

| Folder / file | Contents |
|---|---|
| `docs/oauth2-server-to-server-flow.md` | OAuth 2.0 server-to-server flow: token request, scope, caching, MID notes, and what to do when auth fails |
| `docs/BUILD_LOG.md` | Build log — one entry per day |
| `postman/` | Postman collection + environment template for the QuickStay transactional calls (placeholders only — see `postman/README.md`) |
| `transactional/README.md` | How the Transactional Messaging pieces fit together: definitions first, then sends |
| `transactional/send-definitions/` | Send-definition payloads: booking confirmation, booking cancellation |
| `transactional/send-examples/` | Example send requests (one per definition) with fictional reservation data, plus the responses to check for |
| `journey-api/README.md` | How API-event entry works and why it replaces schedule/batch entry for stay-anchored messages |
| `journey-api/api-event-definition.json` | Both API event definitions (`QS_PreArrival_Event`, `QS_PostStay_Event`) as create payloads, plus the `QS_Journey_Entry` Data Extension schema both events write to |
| `journey-api/entry-payloads/` | One complete fictional entry payload per event, for the same reservation Day 1 confirmed (`QS-84213`), plus the cancellation signal payload |
| `journey-api/journey-design.md` | The two Journeys: entry/re-entry rules, waits anchored to `CheckInDate` / check-out, Journey Data vs Contact Data decision splits, and how a cancellation exits a contact before the send |
| `cloudpages/README.md` | The booking-lookup page's flow, its lookup-security and throttling decisions, and the Data Extensions it expects |
| `cloudpages/order-lookup.ssjs` | The CloudPage itself: AMPscript validates a booking reference + email and renders the stay; SSJS re-sends the confirmation through Day 1's transactional definition, throttled via a log DE |
| `reliability/README.md` | Day 3 in one pass: accepted ≠ delivered, every attempt logged, failures classified, delivery truth by callback, stream kept separate |
| `reliability/logging-de-schema.md` | `QS_API_Log` (one row per attempt) + `QS_Send_Status` (one row per messageKey) schemas, retention, and the never-log list (no tokens, no payload dumps) |
| `reliability/ssjs-error-handling.ssjs` | SSJS patterns: status classification, log-before-you-report, one auth retry, and a worked send wrapper that never surfaces a raw API error |
| `reliability/ens-callback-spec.md` | ENS callback spec: registration/verification, delivery/bounce/complaint handling, duplicate and out-of-order rules |
| `reliability/retry-and-idempotency.md` | The timeout case, same-messageKey retries, EventVersion discipline, the retry / never-retry table, backoff and attempt limits |
| `reliability/deliverability-checklist.md` | Transactional-stream checklist: subdomain/IP/classification separation from promotional, SPF/DKIM/DMARC, content hygiene, per-stream monitoring |

## How a send works, in one pass

1. The booking system asks SFMC for an access token — see the OAuth doc. The token is cached and reused until it is close to expiry; a fresh token is **not** requested per send.
2. A send definition already exists in SFMC for each message type (created once, from the payloads in `transactional/send-definitions/`). A definition binds a `definitionKey`, an email asset, and a subscription.
3. For each reservation change, the booking system posts one send request to that definition, with a unique `messageKey` for the reservation event and the guest + stay fields the email personalises from.
4. SFMC returns `202` with a `requestId` when the request is accepted. Accepted is not the same as delivered — delivery and bounce outcomes arrive later by ENS callback and are recorded per `reliability/`.

## Sequence diagrams

### Transactional send, with reliability (Days 1 + 3)

```
Booking system              SFMC                          QuickStay callback
──────────────              ────                          ──────────────────
POST /v2/token ───────────► validate package
◄────────────────────────── 200 access_token (cached, reused)
POST /messages/{messageKey} ► definition quickstay-booking-confirmation
                            log attempt → QS_API_Log
◄────────────────────────── 202 + requestId   (accepted, NOT delivered)
                            QS_Send_Status = Accepted
                                 │
                                 ├─ delivery ──────────► POST ENS callback
                                 │                       verify → log → 200
                                 │                       QS_Send_Status = Delivered
                                 └─ bounce ────────────► POST ENS callback
                                                         QS_Send_Status = Bounced
Timeout / 5xx on the send? Retry with the SAME messageKey (max 3 attempts).
400 / missing definition? Terminal — fix it, never retry it blindly.
```

### Journey API entry, with cancellation exit (Day 2)

```
Booking system              SFMC Journey Builder
──────────────              ────────────────────
Reservation created/updated
POST /interaction/v1/events ► QS_PreArrival_Event (EventVersion n)
◄────────────────────────── 201 + eventInstanceId   (injected, NOT sent)
                            QuickStay_PreArrival_v1:
                              Wait by Attribute → CheckInDate − 3 days
                              Contact Data split: ReservationStatus?
                                Cancelled → Exit (no send)
                                Confirmed → pre-arrival email sends
Guest cancels
Update Contact payload ────► ReservationStatus = Cancelled
                            (the pre-send split above is what stops it)
Check-out
POST /interaction/v1/events ► QS_PostStay_Event → QuickStay_PostStay_v1
```

## Principles used throughout

1. **A definition is created once; a send is per event.** Definitions are configuration. Sends are traffic. Mixing the two is how duplicate definitions and unrepeatable sends happen.
2. **One `messageKey` per reservation event.** The key is what makes a retry safe to reason about — the same event re-sent carries the same key, a new event gets a new key. See `reliability/retry-and-idempotency.md`.
3. **No credentials in the repo, ever.** Client IDs, secrets, MIDs, and subdomain values live in the caller's secret store and in a local, uncommitted Postman environment — never in a collection, payload, or doc. Every value in this repo is a placeholder.
4. **Fictional data only.** Sample guests use `example.com` addresses and invented reservation references.
5. **Accepted ≠ delivered.** This kit states plainly which step proves what: the API response proves acceptance, not inbox placement.

## Status

**Complete — 3 of 3 days built** — API foundations (Day 1), real-time journeys (Day 2), and reliability (Day 3). See `docs/BUILD_LOG.md` for the per-day record.

Other portfolio projects: Project #1 (SFMC campaign portfolio) and Project #2 (Data 360 Unified Profile & Activation Lab) live under the same GitHub account.
