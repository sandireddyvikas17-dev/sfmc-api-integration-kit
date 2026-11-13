# Journey Design — QuickStay Hotels (Day 2)

The two Journeys that consume the API events in this folder, plus the signal Journey that stops them. Written the way the Journeys are configured in Journey Builder: entry settings first, then the path, then goals and exits. Personal portfolio build for a fictional brand — no employer work, no real data.

## At a glance

| Journey | Entry | Trigger moment | Sends | Normal exit |
|---|---|---|---|---|
| `QuickStay_PreArrival_v1` | API event `QS_PreArrival_Event` | Reservation created / materially changed | 1 pre-arrival email | Check-in date reached |
| `QuickStay_PostStay_v1` | API event `QS_PostStay_Event` | Guest checks out | Feedback email + 1 conditional reminder | Feedback clicked, or reminder window ends |
| `QuickStay_Cancellation_Signal` | API event `QS_Cancellation_Signal` | Reservation cancelled | None — one Update Contact activity | Immediately (single step) |

---

## 1. QuickStay_PreArrival_v1

**Job:** get the right stay details in front of the guest three days before check-in — property, arrival date, room, and anything they need to do before they arrive — and send nothing at all if the reservation no longer exists.

### Entry settings

- **Entry source:** API event `QS_PreArrival_Event`, writing to `QS_Journey_Entry` (schema in `api-event-definition.json`).
- **Contact entry:** *Re-entry only after exiting.* A guest with two different upcoming reservations is in this Journey once per reservation lifecycle, never twice at once for the same reservation version.
- **The duplicate-entry problem, stated plainly:** Journey Builder re-entry is keyed on the **contact**, not on the reservation. Two safeguards carry the reservation-level logic:
  1. The booking system fires the entry event **once per `ReservationId` + `EventVersion`** — an unmodified reservation never re-fires, so it never re-enters.
  2. The first decision split (below) reads **Journey Data** and exits any entry whose `EventVersion` is not the latest version the booking system has issued for that reservation, as recorded on the `QS_Reservation_Status` Contact Data record (kept current by the Update Contact pattern in §3 and by each new entry). A dates-changed rebooking therefore supersedes the old entry instead of doubling the send.

### Path

```
 API entry (QS_PreArrival_Event)
        │
        ▼
 Decision split — Journey Data:
   EventVersion is the latest for ReservationId?
        ├─ No  ──► Exit (superseded by a newer version)
        ▼ Yes
 Wait by Attribute — until 3 days before CheckInDate
   (attribute: Journey Data > CheckInDate, offset −3 days;
    a contact entering inside the window waits 0 and continues)
        │
        ▼
 Decision split — Contact Data (immediately before the send):
   QS_Reservation_Status.ReservationStatus for this ReservationId
        ├─ Cancelled ──► Exit (no send — the Day 1 cancellation
        │                      email already told the guest)
        ▼ Confirmed / Modified
 Email — Pre-Arrival
   (personalised from Journey Data: PropertyName, CheckInDate,
    RoomType, GuestFirstName — the entry snapshot for THIS version
    of the reservation, so a later change can't rewrite the send)
        │
        ▼
 Wait — until CheckInDate
        │
        ▼
 Goal / exit at check-in
```

### Why the splits sit where they do

- **Journey Data vs Contact Data is the whole design.** The version check reads Journey Data because the question is "what was true when *this* entry fired?" The cancellation check reads Contact Data because the question is "what is true *now*?" — a cancellation that happened during the 3-day wait must be seen, and Journey Data would still show the reservation as it was at entry: confirmed. Putting the cancellation split at entry instead of immediately before the send is the classic version of this bug: the Journey checks too early, then mails a guest whose stay was cancelled two days ago.
- **Goal:** contact reaches check-in having received the pre-arrival email with the reservation still active. Goal attainment exits the contact — there is nothing after check-in for this Journey to do; post-stay is a separate Journey with its own event.

---

## 2. QuickStay_PostStay_v1

**Job:** ask for feedback while the stay is still fresh, once — and stop asking the moment the guest answers.

### Entry settings

- **Entry source:** API event `QS_PostStay_Event`, fired at check-out only. A no-show or a cancelled reservation never fires it, so neither can be asked to review a stay that didn't happen.
- **Contact entry:** *Re-entry only after exiting*, same reasoning as pre-arrival.

### Path

```
 API entry (QS_PostStay_Event, ReservationStatus = CheckedOut)
        │
        ▼
 Wait — 1 day
   (not same-day: the guest is travelling home; the request
    lands the next morning instead of competing with the trip)
        │
        ▼
 Email — Post-Stay Feedback Request
        │
        ▼
 Wait — 3 days
        │
        ▼
 Engagement split — clicked the feedback link?
        ├─ Yes ──► Goal met, exit (do not remind someone
        │                    who already answered)
        ▼ No
 Email — Feedback Reminder (one, shorter, last ask)
        │
        ▼
 Wait — 4 days ──► Exit
```

- **Goal:** feedback-link click. Both the split and the goal read the same signal, on purpose: the split stops the reminder, the goal records the outcome for Journey reporting.
- **No third email.** Two asks is the design, not a starting point — reminder fatigue on a feedback request buys complaints, not responses.

---

## 3. How cancellation stops a journey

A guest cancels *after* entering the pre-arrival Journey. Three things happen, in this order:

1. **Transactional send (Day 1):** the booking system sends the cancellation confirmation via the `quickstay-booking-cancellation` definition. The guest hears it from the send layer immediately — they do not wait for any Journey to notice.
2. **Signal event (this folder):** the booking system fires `QS_Cancellation_Signal` (`entry-payloads/cancellation-status-update.json`) into `QuickStay_Cancellation_Signal`, a one-step Journey whose only activity is **Update Contact**: write `ReservationStatus = Cancelled` (with the `ReservationId` and `CancellationReference`) onto the guest's `QS_Reservation_Status` record in Contact Data.
3. **Pre-send check (§1):** when the pre-arrival contact reaches the decision split immediately before the email, it reads that Contact Data record, sees `Cancelled` for its `ReservationId`, and exits without sending.

Why a signal Journey instead of the booking system writing Contact Data directly? There is no plain REST endpoint for "update this contact's attribute-group record" the way there is for a Data Extension row — the Update Contact activity inside a Journey is the supported in-platform mechanism for this write, so the cancellation signal rides the same event machinery as everything else in this kit. The honest limit: the exit is only as timely as the split's position. That is exactly why the split sits directly before the send and not earlier — the gap between "cancelled" and "Journey notices" shrinks to the last step before anything reaches the guest.

## Testing notes

- Fire `pre-arrival-entry.json` against a sandbox MID and confirm the entry lands in `QS_Journey_Entry` with `EventVersion` 1; then fire the cancellation signal for the same reservation and watch the contact exit at the pre-send split with no send.
- Re-fire the pre-arrival payload with `EventVersion` 2 and changed dates: the v1 entry must exit at the version split, the v2 entry must be the one that sends.
- A contact entering with `CheckInDate` two days out (inside the 3-day window) must continue immediately — a negative wait is a configuration error this design avoids by anchoring the wait *by attribute* rather than using a fixed 3-day duration, which would send the email *after* check-in for late bookings.
