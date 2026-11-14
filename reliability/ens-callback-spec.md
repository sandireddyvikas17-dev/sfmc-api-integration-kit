# Event Notification Service Callback Spec — QuickStay Hotels

How Marketing Cloud tells QuickStay what happened **after** acceptance: delivered, bounced, or complained about. The API response (Day 1) proves acceptance. This callback is the delivery record.

Personal portfolio build, fictional brand. The endpoint, keys, and URLs below are placeholders/specification shapes — no real callback URL or signing key exists for this kit, and none is claimed.

## What ENS is, in this kit's terms

Event Notification Service (ENS) pushes event notifications to a callback URL the subscriber registers, instead of the subscriber polling send status. QuickStay registers one callback for its transactional stream, verifies it once, and then receives a POST per event for the message events it subscribed to.

## Registration and verification (one-time)

1. Register the callback URL and the event types (below) via the ENS API (`POST /ens/v1/subscriptions` shape: callback URL, event types, and the target MID in the request context).
2. SFMC sends a **verification request** to the callback containing a verification key/code. The callback must capture that key and echo/confirm it back through the verification step before the subscription becomes active. A callback that never completes verification receives nothing — "ENS is set up but silent" almost always means verification never finished.
3. Store the callback's signing/verification material in the secret store. Keys never go in this repo, in a Data Extension, or in logs.

## Event types this kit consumes

| ENS event | What QuickStay does with it |
|---|---|
| Delivery (`TransactionalSendEvents` / delivery outcome for the message) | Set `DeliveredAt` and `CurrentStatus = Delivered` on `QS_Send_Status` for that `messageKey` |
| Bounce (hard / soft / block) | Set `BounceType` + `BouncedAt`, `CurrentStatus = Bounced`. A hard bounce also flags the address for the booking system — the guest's next confirmation needs a corrected address, not a retry to the same one |
| Complaint / spam complaint | Set `ComplaintAt`, `CurrentStatus = Complaint`, and suppress the address from all further QuickStay sends pending review |
| Send / acceptance-side events where offered | Ignored for status (the `202` already recorded acceptance); counted only as a callback-health signal |

Event types this kit deliberately does **not** consume: open/click engagement events for transactional mail. A booking confirmation's job is delivery, not engagement tracking, and wiring promotional-style engagement handling onto a transactional stream blurs the separation in `deliverability-checklist.md`.

## Callback handling rules

1. **Acknowledge fast, process second.** The handler returns `200` as soon as the raw event is safely stored (a `QS_API_Log` row, `EventType = ENS_Callback`), then updates `QS_Send_Status`. A slow handler that times out invites duplicate callbacks.
2. **Expect duplicates anyway.** Callback delivery is at-least-once in practice. Updates to `QS_Send_Status` are idempotent by `messageKey` + event type + event timestamp: applying the same delivery event twice leaves the same row. Last event wins **by event time**, not by arrival order — an out-of-order bounce must not overwrite a later delivery state incorrectly; where event times tie or conflict, the more severe state (Complaint > Bounce > Delivered) is kept and the conflict is visible in `QS_API_Log`.
3. **Verify before trusting.** Where the account's ENS setup provides callback signing/verification, the handler checks it and rejects (and logs) unverified posts. An open callback URL that anyone can POST a fake "delivered" to is a false record waiting to happen.
4. **Unknown messageKeys are logged, not dropped silently.** A callback for a key this kit never sent means a configuration mismatch (wrong MID, another stream sharing the callback) — log it as `TerminalFailure`-class investigation material, do not create a status row for it.
5. **No guest data beyond the key.** The handler reads the event's message/definition identifiers and outcome fields. It does not store full event payloads; the sanitised summary goes in `QS_API_Log.ErrorSummary`-style fields per `logging-de-schema.md`.

## Failure behaviour on QuickStay's side

- Callback endpoint down: events are missed, not queued forever for QuickStay to replay at leisure. The daily roll-up in `logging-de-schema.md` therefore treats a message stuck at `Accepted` with no callback after a defined window as **unknown**, not delivered — and that distinction is reported as unknown.
- Verification expiring or the subscription being changed in SFMC: the callback-health signal (expected event volume vs received) is the tripwire; a silent stream after a config change is investigated as a subscription problem first, a deliverability problem second.

## Sequence — one confirmation, end to end

```
Booking system          SFMC                       QuickStay callback
──────────────          ────                       ──────────────────
POST send (CONF-1) ───► 202 + requestId
                        log: Accepted (QS_API_Log / QS_Send_Status)
                             │
                             ├─ delivery event ───► POST callback
                             │                    verify → log → 200
                             │                    QS_Send_Status = Delivered
                             │
                             └─ (or) bounce event ► POST callback
                                                  verify → log → 200
                                                  QS_Send_Status = Bounced
                                                  hard bounce flags address
```
