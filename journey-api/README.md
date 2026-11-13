# Journey API — QuickStay Hotels (Day 2)

Day 2's entry layer: how a reservation gets **into a Journey in real time**, through an API event fired by the booking system — not a schedule, not an automation pulling a file, and not a batch refresh.

Day 1's two messages (confirmation, cancellation) are direct transactional sends: one call, one email, done. Pre-arrival and post-stay messages are different — they unfold over days, they branch on what the guest does, and they have to **stop** if the reservation is cancelled. That is Journey work, and a Journey needs an entry event.

Personal portfolio build for the fictional QuickStay Hotels brand. No real credentials, no real guest data — every name, address, and reservation below is invented.

## The one idea

```
 Schedule entry                    API-event entry (this kit)
 ──────────────                    ──────────────────────────
 An automation runs at             The booking system fires an event
 02:00, finds whoever is           the moment a reservation changes,
 in the entry DE, and              carrying that reservation's data
 enters them in a batch.           with it. One reservation, one
                                   entry, in seconds.
```

Batch entry is fine for a weekly campaign. It is wrong for "your check-in is in three days," because the clock that matters is the reservation's, not the automation's. The event carries `CheckInDate` / `CheckOutDate` with it, and the Journey's waits are anchored to those dates — see `journey-design.md`.

## The two events

| Event definition key | Fired by the booking system when… | Enters | Defined in |
|---|---|---|---|
| `QS_PreArrival_Event` | A reservation is created or materially changed (dates, property, room) | `QuickStay_PreArrival_v1` | `api-event-definition.json` |
| `QS_PostStay_Event` | The guest checks out (`ReservationStatus` becomes `CheckedOut`) | `QuickStay_PostStay_v1` | `api-event-definition.json` |

Cancellation does **not** get a third entry event. A cancellation has to act on a guest who may already be inside the pre-arrival Journey, so it is handled as an update-and-exit pattern, not an entry — see "How cancellation stops a journey" in `journey-design.md`.

## Endpoints used

| Step | Call |
|---|---|
| Authenticate | `POST /v2/token` — see `docs/oauth2-server-to-server-flow.md` (Day 2 adds the Journeys permissions noted there) |
| Create an event definition | `POST /interaction/v1/eventDefinitions` |
| Check an event definition | `GET /interaction/v1/eventDefinitions/key:{eventDefinitionKey}` |
| Fire one entry event | `POST /interaction/v1/events` |
| Check one fired event | `GET /interaction/v1/events/{eventInstanceId}` |

All calls use `Authorization: Bearer <access_token>` against the tenant's `rest_instance_url`, with the cached-token rule from Day 1: reuse the token until it is near expiry; on a `401`, fetch one new token and retry once.

## Files in this folder

| File | Contents |
|---|---|
| `api-event-definition.json` | Both event definitions as create payloads, plus the entry Data Extension field schema both events write to |
| `entry-payloads/pre-arrival-entry.json` | One complete fictional pre-arrival entry: the same reservation (`QS-84213`) Day 1 confirmed |
| `entry-payloads/post-stay-entry.json` | The matching post-stay entry, fired at check-out for the same reservation |
| `entry-payloads/cancellation-status-update.json` | The cancellation pattern: an Update Contact payload that marks the reservation cancelled in Contact Data, so the pre-arrival Journey exits before its next send |
| `journey-design.md` | The two Journeys that consume these events: entry settings, waits anchored to stay dates, decision splits, goals, and exit rules |

## The entry call, in one pass

1. The booking system already holds a cached access token (Day 1's rule).
2. On a reservation change it posts **one** event to `POST /interaction/v1/events`: `ContactKey` (the guest), `EventDefinitionKey` (which event), and a `Data` block carrying exactly the fields in the event schema — no more of the booking record than the Journey uses.
3. SFMC returns `201` with an `eventInstanceId`. That ID is the receipt: log it against the reservation. `201` proves the contact was injected into the Journey — it does not prove any email was sent; the Journey's waits and splits run from there.
4. A failed fire (network, `400`, `401` after the one auth retry) is the **booking system's** problem to retry, with the same reservation data. There is no batch later that sweeps up a missed event — which is why Day 3 is all about logging, retries, and idempotency.

## Field discipline

The event schema is deliberately the same field set Day 1's send examples already use — `ReservationId`, `PropertyName`, `CheckInDate`, `CheckOutDate`, `RoomType`, `GuestFirstName`, `NumberOfGuests` — plus the two fields Journey logic needs: `ReservationStatus` and `EventVersion`. One reservation shape across the transactional sends and the Journeys means one mapping for the booking system to maintain, and a send payload and an entry payload for the same reservation can be compared field-for-field when something looks wrong.

`EventVersion` deserves its own note: it increments on every material change to the reservation. The Journey design uses it (with `ReservationId`) to tell "the same reservation, updated" apart from "a new reservation" — see the re-entry rules in `journey-design.md`.
