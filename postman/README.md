# Postman — QuickStay SFMC Transactional Kit

A ready-to-import collection for the Day 1 calls, plus an environment **template**. Everything in this folder uses placeholders — there are no real credentials, MIDs, subdomains, or asset keys in either file, and there never should be.

## Import order

1. Import `QuickStay-SFMC-Transactional.postman_environment.json` first.
2. Copy it in Postman to a local environment (e.g. `QuickStay — My Sandbox`) and fill in **your own** values there. Never commit a filled-in copy back to this repo — Postman's *initial* values are written to the file on export, which is how secrets leak into Git.
3. Import `QuickStay-SFMC-Transactional.postman_collection.json` and select your local environment.

## Environment variables

| Variable | What it is | Secret? |
|---|---|---|
| `auth_base_url` | Tenant auth host, e.g. `<subdomain>.auth.marketingcloudapis.com` | No — but tenant-specific configuration |
| `rest_base_url` | Tenant REST host from the token response's `rest_instance_url` | No — tenant-specific configuration |
| `client_id` | Installed Package client ID | **Yes** — local environment only |
| `client_secret` | Installed Package client secret | **Yes** — local environment only, set as a *secret* / current value in Postman |
| `account_id` | Target MID (child BU if sends run there) | No |
| `scope` | Defaults to `email_send` | No |
| `access_token` | Filled in automatically by the token request's test script | Treat as a credential while valid |
| `messageKey` | Per-send key, following the convention in `transactional/README.md` | No |

## Request order for a first run

1. **Auth → Get Access Token (server-to-server)** — the test script saves `access_token` into the active environment.
2. **Definitions → Create Booking Confirmation Definition** and **Create Booking Cancellation Definition** — once per MID. A `409`-style "already exists" outcome on a re-run is expected, not an error to debug.
3. **Definitions → Get Definition** — confirm each definition is `Active` and points at the right asset before sending traffic at it.
4. **Sends → Send Booking Confirmation** / **Send Booking Cancellation** — one fictional reservation each. Check for `202` + a `requestId`, then **Sends → Get Send Status** with the same `messageKey`.

## House rules

- Re-run the token request only when the saved token is near expiry or a call returns `401` — see the caching rule in `docs/oauth2-server-to-server-flow.md`.
- Change `messageKey` for every genuinely new event. Reusing a key is for retrying the *same* event only.
- If you export the collection or environment to share it, export the templates from this repo — never your filled-in local copies.
