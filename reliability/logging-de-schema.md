# Logging Data Extensions — QuickStay Hotels

The record this kit keeps of every API attempt, so "did the confirmation go out?" is a query, not a guess.

Personal portfolio build, fictional brand. No real guest data — sample rows use `example.com` addresses and invented reservation references, matching the rest of the kit.

## Principle

Log the **attempt**, not just the success. A log that only records sends that worked cannot answer the only question that matters when one fails. Every call in this kit — transactional send, Journey entry, CloudPage re-send, ENS callback receipt — writes one row when it completes (success or failure), with enough context to reconstruct what was asked, what came back, and whether a retry is safe.

What is **never** logged: access tokens, client secrets, full email bodies, or any guest field the message did not need. The log carries references (`ReservationId`, `messageKey`), not the booking record.

## QS_API_Log — one row per attempt

Sendable: **No** (this is an operational log, never a sendable DE).
Primary key: `LogId` + `AttemptedAt`.

| Field | Type (length) | Nullable | Notes |
|---|---|---|---|
| `LogId` | Text (50) | No — PK | Caller-generated GUID per attempt |
| `AttemptedAt` | Date | No — PK | UTC timestamp the attempt completed |
| `EventType` | Text (30) | No | `TransactionalSend` / `JourneyEntry` / `Resend` / `ENSC_Callback` |
| `ReservationId` | Text (20) | No | e.g. `QS-84213` — the same ID Days 1–2 use |
| `ContactKey` | Text (100) | Yes | Guest's ContactKey where the call carries one |
| `DefinitionKey` | Text (100) | Yes | Send definition key, or Journey event definition key for entries |
| `MessageKey` | Text (100) | Yes | The kit's `QS-<ReservationId>-CONF/CANC/RESEND-<seq>` key; the idempotency anchor |
| `EventInstanceId` | Text (50) | Yes | Returned by a successful Journey entry (`201`) |
| `RequestId` | Text (50) | Yes | Returned by an accepted transactional send (`202`) |
| `AttemptNumber` | Number | No | 1 for the first try; increments per retry of the same event |
| `HttpStatus` | Number | Yes | Response status; empty for a timeout/network failure |
| `Outcome` | Text (20) | No | `Accepted` / `RetryableFailure` / `TerminalFailure` / `AuthRefreshed` / `CallbackReceived` |
| `ErrorCode` | Text (50) | Yes | SFMC error code where returned; never a raw stack trace |
| `ErrorSummary` | Text (500) | Yes | Short, sanitised summary — no tokens, no payload dump |
| `SourceSystem` | Text (50) | No | `BookingSystem` / `CloudPage` / `ENS` |
| `CorrelationId` | Text (50) | Yes | The booking system's own trace ID, echoed so the two logs can be joined |

### Worked rows (fictional, reservation QS-84213)

| EventType | MessageKey | Attempt | HTTP | Outcome |
|---|---|---|---|---|
| TransactionalSend | QS-QS-84213-CONF-1 | 1 | 202 | Accepted |
| JourneyEntry | — (EventInstanceId recorded) | 1 | 201 | Accepted |
| TransactionalSend | QS-QS-84213-CONF-1 | 2 | — (timeout on attempt 1, retried with same key) | Accepted |
| ENS_Callback | QS-QS-84213-CONF-1 | — | 200 (callback received) | CallbackReceived |

Note the timeout row pair: attempt 1 produced no HTTP status, attempt 2 reuses the **same** `MessageKey` — that sameness is what lets the retry be recognised (see `retry-and-idempotency.md`).

## QS_Send_Status — one row per message event (roll-up)

Sendable: **No**. Primary key: `MessageKey`.
Updated by ENS callbacks (see `ens-callback-spec.md`) and by a daily Automation Studio SQL roll-up from `QS_API_Log`.

| Field | Type (length) | Notes |
|---|---|---|
| `MessageKey` | Text (100) — PK | One row per reservation message event |
| `ReservationId` | Text (20) |  |
| `DefinitionKey` | Text (100) | Which message this is |
| `AcceptedAt` | Date | From the `202` response |
| `DeliveredAt` | Date, nullable | Set by the ENS delivery callback |
| `BounceType` | Text (20), nullable | `Hard` / `Soft` / `Block` where a bounce callback arrives |
| `BouncedAt` | Date, nullable |  |
| `ComplaintAt` | Date, nullable | Set by a complaint callback; also drives suppression |
| `CurrentStatus` | Text (20) | `Accepted` / `Delivered` / `Bounced` / `Complaint` — last event wins, in event-time order |

`QS_API_Log` is the evidence; `QS_Send_Status` is the answer. Support looks at the status row; engineering looks at the log rows behind it.

## Retention and hygiene

- `QS_API_Log`: retain 90 days, then a scheduled Automation Studio activity archives/deletes older rows. A log DE that grows forever becomes the next incident.
- `QS_Send_Status`: retain for the life of the reservation plus 90 days.
- Neither DE is sendable, neither is used for segmentation, and neither appears in Contact Builder as a population — they are operational records, joined on `ReservationId` / `MessageKey` only when investigating.
- Timestamps are stored in UTC; local-time conversion happens at reporting, never at write.
