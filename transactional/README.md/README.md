# Transactional Messaging — QuickStay Hotels

Day 1's send layer: the two messages the booking system can trigger the moment a reservation changes — **booking confirmation** and **booking cancellation**. Pre-arrival and post-stay messages are Journey-based and land on Day 2; they are not transactional definitions.

## Definitions first, sends second

The Transactional Messaging API separates two things that are easy to blur:

| Concept | What it is | How often |
|---|---|---|
| **Send definition** | Configuration: a `definitionKey`, the email asset it sends, the subscription it sends under, and send classification / delivery profile choices | Created **once** per message type (and updated deliberately, like config) |
| **Send request** | Traffic: one call per reservation event, carrying the recipient, a unique `messageKey`, and the fields the email personalises from | **Once per event** — one booking, one call |

```
 send-definitions/                         send-examples/
 ─────────────────                         ──────────────
 booking-confirmation.json  ──create──►    booking-confirmation-send-request.json
 booking-cancellation.json  ──create──►    booking-cancellation-send-request.json
        (once, per MID)                         (per reservation event)
```

## Endpoints used

| Step | Call |
|---|---|
| Authenticate | `POST /v2/token` — see `docs/oauth2-server-to-server-flow.md` |
| Create a definition | `POST /messaging/v1/email/definitions` |
| Check a definition | `GET /messaging/v1/email/definitions/{definitionKey}` |
| Update a definition | `PATCH /messaging/v1/email/definitions/{definitionKey}` |
| Send one message | `POST /messaging/v1/email/messages/{messageKey}` |
| Check one send's status | `GET /messaging/v1/email/messages/{messageKey}` |

All calls use `Authorization: Bearer <access_token>` against the tenant's `rest_instance_url`.

## The two definitions

| `definitionKey` | Trigger in the booking system | Email's job |
|---|---|---|
| `quickstay-booking-confirmation` | Reservation created (and, for a material change, re-issued with a new `messageKey`) | Confirm the stay: property, dates, room, guest, reservation reference |
| `quickstay-booking-cancellation` | Reservation cancelled | Confirm the cancellation plainly, state the cancellation reference, and stop the guest wondering whether it went through |

Both payloads in `send-definitions/` reference the email asset and list by **placeholder customer keys** (`{{email_customer_key}}`, `{{list_id}}`). Those are replaced with the real keys from the target MID at setup time — asset keys differ per account, so a real key committed here would be wrong everywhere else anyway.

Notes on the payload shape:

- `status` starts as `Active` in these templates so a reviewer can create-and-test in a sandbox MID; in a production rollout, create as `New`, verify the asset renders, then activate.
- `options.createJourney` is `false`: these are direct transactional sends, not Journey sends. Day 2's pre-arrival / post-stay journeys are separate, API-event-entered journeys.
- The `subscriptions` block pins the send to one list so transactional traffic stays separated from promotional sends and their unsubscribe handling.

## The send request

Each file in `send-examples/` is one complete send: recipient, the `definitionKey` it targets (in the body for queue-style calls and implied by the route in the examples' comments), and an `attributes` block carrying exactly the fields the email needs — no more of the reservation record than the message uses.

Field discipline matters: `CheckInDate`, `CheckOutDate`, `PropertyName`, `RoomType`, `ReservationId`, and `GuestFirstName` are what the confirmation renders. Sending the full booking record "just in case" leaks guest data into logs and send payloads for no benefit.

## messageKey convention

```
QS-<ReservationId>-CONF-<event sequence>     e.g. QS-QS-84213-CONF-1
QS-<ReservationId>-CANC-<event sequence>     e.g. QS-QS-84213-CANC-1
```

- Unique per **event**, stable per **retry**: if the booking system retries the same confirmation, it reuses the same `messageKey`, so the retry can be recognised instead of silently sending twice.
- A genuinely new event (the guest changes dates and a fresh confirmation is owed) gets the next sequence number and a new key.
- Day 3 builds the full retry / idempotency notes on top of this convention.

## What the response proves — and what it does not

A send returns `202 Accepted` with a `requestId` and per-recipient status. That proves SFMC **accepted** the request. It does not prove delivery, inbox placement, or rendering on the guest's device. Bounces, delivery outcomes, and Event Notification Service callbacks are Day 3's reliability work — this README deliberately does not claim them for Day 1.
