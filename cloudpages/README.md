# CloudPages — QuickStay Hotels (Day 2)

The guest-facing half of Day 2: one CloudPage that lets a guest find their own booking and get a fresh copy of the confirmation email — without a call to the property, and without the page leaking anything to someone who isn't the guest.

Personal portfolio build for the fictional QuickStay Hotels brand. No real credentials, no real bookings.

## The file

| File | What it is |
|---|---|
| `order-lookup.ssjs` | The complete CloudPage HTML resource: AMPscript for validation/lookup/rendering + an SSJS block for the re-send API call. Paste into a CloudPages HTML page in a sandbox MID to run it. Config values at the top are placeholders — see the file's header. |

(The `.ssjs` extension is deliberate: the API-calling half of this page is SSJS, and the filename should say so. The file itself is a full CloudPage, AMPscript blocks included.)

## Flow

```
 Guest ──►  enters QS-##### reference + booking email
                    │
            AMPscript validates the reference format
            (RegExMatch ^QS-[0-9]{4,6}$) and the email shape
                    │
            LookupRows(QS_Reservations) on BOTH fields together
                    ├─ 0 rows / mismatch ─► ONE generic "couldn't find
                    │                          that booking" message
                    ▼ 1 row
            Stay summary (property, dates, room, status)
                    ├─ Cancelled ─► plain "this booking was cancelled",
                    │                 no re-send offered
                    ▼ Active
            [Re-send my confirmation]
                    │
            SSJS: throttle check in QS_Resend_Log
            (1 per 15 min, 3 per day per reservation)
                    │
            OAuth token (server-to-server, Day 1 flow)
                    │
            POST /messaging/v1/email/messages/QS-<id>-RESEND-<seq>
            to Day 1's quickstay-booking-confirmation definition
                    ├─ 202 ─► log the re-send, tell the guest it's sent
                    └─ else ─► log status + messageKey server-side only;
                               guest sees a plain retry message
```

## Design decisions worth naming

1. **The pair is the credential.** A booking reference (`QS-84213`) is sequential and guessable; an email alone identifies nobody's booking. Requiring both, matched against the *same row in one lookup*, is what makes this page safe to expose. Two separate lookups would leak "this reference exists" to anyone who typed it.
2. **One generic failure message.** "Reference not found" vs "email doesn't match that reference" as different answers would turn the form into a reservation-existence oracle. Every lookup failure says the same sentence.
3. **AMPscript looks up, SSJS calls APIs.** The division follows the platform: AMPscript is the right tool for DE lookups and page rendering; token handling and REST calls are SSJS work. A page view with no re-send never runs the SSJS block at all.
4. **A re-send is a new event, not a retry.** It takes the next `RESEND-<seq>` messageKey (`QS-QS-84213-RESEND-1`), counted from `QS_Resend_Log` — it does not reuse the original `CONF-1` key, because Day 1's convention reserves key-reuse for retrying the *same* event.
5. **Throttling is part of the feature.** An unthrottled "email me again" button is a mail-bomb lever pointed at whoever's email a stranger types in. 1 per 15 minutes / 3 per day per reservation, enforced from the log DE before any API call.
6. **No token caching here — and the file says why.** A CloudPage request is short-lived; there is no safe in-page place to cache a token across guests. The throttle is what keeps the resulting per-resend token call rare. High-volume server callers must cache instead — that's Day 1's rule, unchanged.

## Data Extensions the page expects

**`QS_Reservations`** — one row per reservation version, synced by the booking system: `ReservationId` (PK), `EmailAddress`, `ContactKey`, `GuestFirstName`, `PropertyName`, `CheckInDate`, `CheckOutDate`, `RoomType`, `NumberOfGuests`, `ReservationStatus`, `EventVersion`. (Field shape matches `QS_Journey_Entry` in `../journey-api/` on purpose — one reservation shape everywhere in this kit.)

**`QS_Resend_Log`** — one row per re-send: `ReservationId`, `EmailAddress`, `ResendSequence`, `RequestedAt`, `MessageKey`. Written by the page itself; read by the page for throttling, and by support when a guest says the email never arrived.

## Honest limits

- This page was written and reviewed as code, not run against a live MID from this repo — the SSJS `HTTP.Post` header-argument shape and the `DataExtension[...].Rows` syntax follow the standard SSJS patterns and should be verified on first publish in a sandbox, like any CloudPage code review would.
- Lookup security here is "reference + matching email", appropriate for re-sending an email to the address already on the booking. It is **not** an account login and must never grow into one (no payment details, no stay changes) without real authentication in front of it.
