# Reliability — QuickStay Hotels (Day 3)

Day 3's layer: what happens **after** the API call — when a send fails, times out, bounces, or gets called twice. Days 1–2 made the sends and the Journey entries work. This folder is about proving what happened, recovering without duplicating, and keeping the transactional stream deliverable.

Personal portfolio build for the fictional QuickStay Hotels brand. Not employer work. No real credentials, no real guest data — every name, address, and reservation in this folder is invented.

## The one idea

```
 Accepted ≠ delivered ≠ safe to retry blindly
 ─────────────────────────────────────────────
 202 / 201 proves SFMC accepted the request.
 It does not prove delivery, and a timeout
 does not prove failure. Reliability is the
 set of records and rules that lets you tell
 those apart — and act on the difference.
```

A campaign send that fails can be re-run tomorrow. A booking confirmation that fails leaves a guest with no proof of a paid stay, and a confirmation sent twice leaves them wondering which one is real. That asymmetry is why this folder exists.

## Files in this folder

| File | Contents |
|---|---|
| `logging-de-schema.md` | The `QS_API_Log` Data Extension schema: one row per API attempt, send, Journey entry, and ENS callback, plus the `QS_Send_Status` roll-up and retention rules |
| `ssjs-error-handling.ssjs` | SSJS error-handling patterns: try/catch structure, status-code classification, log-before-you-report, and a worked re-send wrapper that never surfaces a raw API error |
| `ens-callback-spec.md` | Event Notification Service callback spec: subscription/verification flow, the event types this kit consumes, payload handling, signature/verification notes, and how a callback updates `QS_Send_Status` |
| `retry-and-idempotency.md` | Retry and idempotency notes: which failures retry, backoff, the `messageKey` / `EventVersion` rules that make a retry recognisable, and the timeout case |
| `deliverability-checklist.md` | Transactional-stream deliverability checklist: subdomain and IP separation from promotional traffic, authentication (SPF/DKIM/DMARC), list/classification hygiene, and monitoring |

## How the pieces fit

1. **Every attempt is logged first-class.** A send, a Journey entry, and a re-send each write to `QS_API_Log` with the `messageKey` (or `eventInstanceId`), the reservation, the attempt number, and the outcome class — before any success is reported anywhere.
2. **Failures are classified, not just caught.** `401` (one auth retry), `400` (do not retry — fix the payload), `429` (back off), `5xx`/timeout (retry with the same key) are different actions, not one generic "error". See `ssjs-error-handling.ssjs` and `retry-and-idempotency.md`.
3. **Delivery truth arrives later, by callback.** ENS callbacks for delivery, bounce, and complaint events update `QS_Send_Status`. The API response is the acceptance record; the callback is the delivery record. Neither substitutes for the other.
4. **The stream stays separate.** Transactional mail rides its own subdomain, IP, send classification, and list — so a promotional campaign's reputation problems can never delay a booking confirmation. See `deliverability-checklist.md`.

## Honest limits

- This kit is code-reviewed, not run against a live MID. The schemas, patterns, and specs are written to be deployable as-is in a sandbox, and are labelled as a portfolio build throughout.
- ENS event availability and payload fields vary by account configuration; the spec names what this kit consumes and what it deliberately ignores, rather than claiming every ENS event type.
- No delivery, open, or engagement metrics are claimed anywhere in this folder. There is no live stream to measure.
