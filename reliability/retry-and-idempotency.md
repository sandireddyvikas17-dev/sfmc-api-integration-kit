# Retry and Idempotency Notes — QuickStay Hotels

When a call fails, the dangerous question is not "can we try again?" — it is "do we know whether the first try worked?" These notes are the kit's answer, built on the Day 1 `messageKey` convention and the Day 2 `EventVersion` rule.

Personal portfolio build, fictional brand, fictional data throughout.

## The timeout case (why this file exists)

```
Booking system posts a confirmation ──► SFMC
                    ◄── (response never arrives: timeout)

Did the send happen?
  • If you retry with a NEW messageKey and the first send did land,
    the guest gets two confirmations for one booking.
  • If you never retry and the first send never landed,
    the guest gets no confirmation at all.
```

Neither blind retry nor no retry is safe. What makes retry safe is **identity**: the retry carries the same identity as the original event, so the system can recognise "same event, second attempt" instead of treating it as a new event.

## Idempotency rules in this kit

1. **One `messageKey` per reservation event — stable across retries.** Day 1's convention: `QS-<ReservationId>-CONF-<seq>` / `-CANC-<seq>`, and Day 2's re-send adds `-RESEND-<seq>`. A retry of the same event reuses the same key and sequence. A genuinely new event (dates changed, a fresh confirmation is owed) takes the next sequence and a new key.
2. **Check before re-sending after a timeout.** Where the send-status endpoint can be queried by `messageKey` (`GET /messaging/v1/email/messages/{messageKey}`), a timeout retry first asks "what do you have for this key?" An accepted send is not re-sent; an absent one is retried with the same key.
3. **Journey entries use `EventVersion` the same way.** Day 2's entry DE primary key is `ContactKey + ReservationId + EventVersion`. Re-firing the same entry event with the same version is the same entry; a material reservation change increments the version and is legitimately a new entry. A retry must never increment the version to "make it go through" — that converts a retry into a duplicate journey entry.
4. **ENS callback application is idempotent** by `messageKey` + event type + event time (see `ens-callback-spec.md`). Duplicate callbacks are expected and harmless by design.
5. **Re-send is not retry.** The Day 2 CloudPage re-send is a *new* guest-requested event with a new `-RESEND-<seq>` key and its own throttle. Calling a re-send a "retry" in logs or UI confuses the audit trail; the log's `EventType` keeps them distinct.

## Which failures retry — and which never do

| Failure | Retry? | How |
|---|---|---|
| `401` (token expired/invalid) | Once, immediately | Discard cached token, fetch one new token, retry once. A second `401` is terminal — it is a configuration/permissions problem |
| Timeout / network failure (no status) | Yes | Status check by `messageKey` first where possible, then retry with the **same** key |
| `429` (throttling) | Yes, backed off | Honour any retry guidance in the response; otherwise exponential backoff (below). Throttling at a booking spike is exactly when hammering makes it worse |
| `5xx` from SFMC | Yes, backed off | Same key, attempt counter increments, each attempt logged |
| `400` (bad payload / validation) | **No** | Terminal. Retrying an invalid payload sends the same invalid payload. Fix the mapping, then issue the corrected send as a deliberate new attempt with the failure linked in the log |
| `404` definition/event not found | **No** | Terminal. Configuration is missing in that MID; retrying cannot create it |
| Hard bounce (via ENS, after acceptance) | **No** — not a send retry at all | The address is the problem. Flag it; the fix is a corrected address from the guest, not another attempt |

## Backoff and attempt limits (booking-system side)

- Max **3 attempts** per event (1 try + 2 retries) for retryable failures, then the event is parked and alerted — a confirmation that has failed three times needs a human-visible record, not a fourth silent try.
- Backoff: ~2 seconds, then ~8 seconds, with jitter — short because a confirmation is time-sensitive, bounded because an unbounded fast loop is a throttling incident. Longer schedules belong to batch systems, not transactional sends.
- Every attempt — not just the final outcome — writes a `QS_API_Log` row with its `AttemptNumber`. A log showing only attempt 3 hides that attempts 1–2 happened.
- CloudPage/SSJS context does **not** sleep-and-retry in the guest's page (see `ssjs-error-handling.ssjs`): it logs the retryable outcome and returns it, and the caller schedules the retry with the same key.

## What "safe" does not mean

- Idempotency here is a **discipline**, not a platform guarantee this kit claims: the keys, version rules, status checks, and logs are how the caller makes duplicates recognisable and investigable. The kit does not claim SFMC deduplicates arbitrary re-sends on the caller's behalf.
- A retry policy cannot fix a wrong payload, a missing definition, or a bad address. Those are terminal for a reason: they need a fix, not another attempt.
