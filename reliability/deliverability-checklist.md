# Transactional-Stream Deliverability Checklist — QuickStay Hotels

A booking confirmation is the one email a guest is actively waiting for. This checklist keeps QuickStay's transactional stream able to land it — mainly by keeping it **separate** from promotional mail in every way a mailbox provider can see.

Personal portfolio build, fictional brand. This is a checklist/specification — no live stream, subdomain, or IP exists for QuickStay, and no delivery metrics are claimed.

## Separation (the core of the list)

- [ ] **Dedicated subdomain for transactional mail** (e.g. a transactional subdomain distinct from the promotional sending subdomain), so promotional reputation cannot drag transactional delivery down with it — and a transactional problem is visible on its own.
- [ ] **Dedicated IP / delivery profile for the transactional stream** where the account's setup supports it; promotional volume spikes (a sale campaign) must never share — and warm, throttle, or burn — the pipe a confirmation needs in the same hour.
- [ ] **Separate send classification + delivery profile** in SFMC for transactional sends, distinct from commercial/promotional classifications.
- [ ] **Separate list / subscription handling:** transactional sends ride the definition's pinned subscription (Day 1), and a promotional unsubscribe must never suppress a booking confirmation. Conversely, transactional addresses are not a promotional audience by default.
- [ ] **Separate From identity pattern** for transactional mail (recognisably the booking/service sender) vs campaign mail, consistently used — guests and filters both learn from consistency.

## Authentication

- [ ] **SPF** published for the transactional subdomain, covering the actual sending source.
- [ ] **DKIM** signing enabled for the transactional subdomain/domain in SFMC (SAP / authenticated domain setup), verified after any DNS or account change.
- [ ] **DMARC** published, aligned with the SPF/DKIM domains, at a real enforcement posture for the organisational domain — and checked after subdomain changes so the new stream does not silently fail alignment.
- [ ] Authentication re-verified after **any** change: new subdomain, new IP, MID/BU restructure, or DNS provider move. "It was set up last year" is not a check.

## Content and behaviour hygiene

- [ ] Transactional templates carry **only** the transaction: stay details, references, and service links (like Day 2's booking lookup). No promotional blocks, no cross-sell modules — mixing marketing content into a transactional message risks both its classification and its trust.
- [ ] Links in transactional mail use the transactional stream's tracked/branded domain setup, consistent with its authentication — not a borrowed promotional redirect domain.
- [ ] Subject lines state the transaction plainly (booking confirmed / cancelled + reference). No campaign-style subject tactics on a service message.
- [ ] A plain-text part exists and matches the HTML part's substance.
- [ ] Test sends proofed for rendering and for personalisation fallbacks (Day 1's field discipline: the email renders correctly with exactly the fields the send carries).

## Address and bounce handling

- [ ] Hard bounces from the transactional stream (via ENS — see `ens-callback-spec.md`) flag the address for correction at the source (the booking record), not just suppression in SFMC.
- [ ] Soft-bounce patterns are monitored per stream: a rising soft-bounce rate on transactional mail is an infrastructure signal, investigated on this stream — not averaged away inside overall account numbers.
- [ ] Complaints on transactional mail are treated as severity-one review items: a guest complaining about a confirmation usually means duplication, wrong-recipient, or frequency problems upstream (see the retry rules — a duplicate confirmation is a deliverability bug as well as a UX bug).

## Monitoring

- [ ] Delivery/bounce/complaint rates watched **per stream** (transactional separate from promotional) via `QS_Send_Status` roll-ups and ENS volume — a stream that goes silent is itself an alert (subscription/verification first, per the ENS spec).
- [ ] Volume sanity: transactional volume should track booking volume. A spike that bookings do not explain means something is re-sending — check `QS_API_Log` attempt numbers before checking reputation.
- [ ] Seed/proof checks after template or classification changes, before the change carries real bookings.
- [ ] Post-change watch: after any DNS, IP, subdomain, or classification change, the transactional stream gets an explicit delivery watch window — not an assumption that setup equals delivery.

## Explicitly out of scope here

- Promotional-stream warm-up schedules, promotional IP warming, and campaign reputation management — a different checklist for a different stream. Keeping them out of this file is the separation principle applied to the docs themselves.
- Any claimed delivery rate, inbox rate, or benchmark. There is no live QuickStay stream to measure; this checklist states what would be set up and checked, nothing more.
