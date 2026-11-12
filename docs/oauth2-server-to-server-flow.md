# OAuth 2.0 Server-to-Server Flow — QuickStay → SFMC

How the QuickStay booking system authenticates to Salesforce Marketing Cloud before it sends anything. This is the server-to-server (client credentials) flow used by an SFMC **Installed Package** with the **Server-to-Server** integration type. There is no user, no browser, and no redirect in this flow — one system talks to another.

> Placeholders only. `{{auth_base_url}}`, `{{client_id}}`, `{{client_secret}}`, and `{{account_id}}` are filled in by the caller's secret store / local environment. Real values never go in this repo, in Postman exports, or in logs.

## The flow

```
 Booking system                                   SFMC auth endpoint
 ──────────────                                   ──────────────────
 1. Read client_id + client_secret
    from the secret store (never code)
 2. POST /v2/token ───────────────────────────►  Validate credentials,
    grant_type=client_credentials                 package permissions + scope
    account_id=<target MID>
 ◄─────────────────────────────── 200 OK ──────  access_token + expires_in
                                                  + rest_instance_url
 3. Cache the token keyed by MID
    Reuse until ~5 min before expiry
 4. Call REST APIs with
    Authorization: Bearer <access_token> ─────►  Transactional / Journey APIs
    against rest_instance_url
 5. On 401: discard the cached token,
    fetch ONE new token, retry ONCE
```

## 1. Prerequisites (one-time setup in SFMC)

- An Installed Package in the **parent (enterprise) account**, integration type **Server-to-Server**.
- Under the package's API Integration component, only the permissions this kit needs:
  - **Email — Send** (Transactional Messaging sends)
  - **Journeys — Read / Execute** as needed for Day 2's API events (added when Day 2 lands, not before)
- The target Business Unit's MID, if sends must run under a child BU. Server-to-server packages are created at the enterprise level; the `account_id` in the token request is how a call targets a specific MID.

Least privilege matters here: a booking integration that can also delete data extensions or manage users is a wider blast radius than it needs to be.

## 2. Token request

```http
POST https://{{auth_base_url}}/v2/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id": "{{client_id}}",
  "client_secret": "{{client_secret}}",
  "account_id": "{{account_id}}",
  "scope": "email_send"
}
```

| Field | Notes |
|---|---|
| `grant_type` | Always `client_credentials` for this flow |
| `client_id` / `client_secret` | From the Installed Package. Secret-store values, never committed |
| `account_id` | The MID the token acts for. Omit it and the token defaults to the enterprise MID — a common cause of "it works in the parent, fails in the child BU" bugs |
| `scope` | Space-separated, optional. Request only what the package was granted; asking for an ungranted scope fails the request |

The auth base URL is tenant-specific: `https://<tenant-subdomain>.auth.marketingcloudapis.com`. The subdomain comes from the SFMC stack / installed package details — it is configuration, not a secret, but it still lives in the environment template rather than being hard-coded per caller.

## 3. Token response

```json
{
  "access_token": "<token value — never log this>",
  "token_type": "Bearer",
  "expires_in": 1079,
  "rest_instance_url": "https://{{rest_base_url}}/",
  "soap_instance_url": "https://{{soap_base_url}}/",
  "scope": "email_send",
  "account_id": "{{account_id}}"
}
```

- `expires_in` is in seconds and is typically just under 20 minutes. Treat the returned value as the truth — do not hard-code a lifetime.
- Call REST APIs against `rest_instance_url` from the response, not a guessed host.
- The token itself is a credential while it is alive: never write it to an application log, an error payload, or a support ticket.

## 4. Caching rule (the part people get wrong)

**Cache one token per MID and reuse it.** Requesting a fresh token for every send is slow, wasteful, and can hit auth rate limits exactly when booking volume spikes — which is also exactly when confirmations matter most.

- Key the cache by `account_id` (MID). A token for the parent MID is not a token for a child BU.
- Refresh when less than ~5 minutes of `expires_in` remains, not after it has already expired mid-request.
- If two booking-system instances run at once, a shared cache (or accepting a brief overlap of two valid tokens) beats both instances hammering `/v2/token` independently.

## 5. Using the token

```http
POST https://{{rest_base_url}}/messaging/v1/email/messages/{{messageKey}}
Authorization: Bearer <access_token>
Content-Type: application/json
```

No token goes in a URL, ever — URLs get logged by proxies and tooling that headers do not.

## 6. Failure handling

| Symptom | Likely cause | Action |
|---|---|---|
| `400` on `/v2/token` | Bad `grant_type`, malformed body, or an ungranted `scope` | Fix the request; do not retry unchanged |
| `401` / `403` on `/v2/token` | Wrong client credentials, or the package lacks the permission | Stop and check the Installed Package; repeated retries will not fix a permission |
| `401` on an API call that worked a minute ago | Cached token expired | Discard it, fetch one new token, retry the call **once** |
| Sends land in the wrong BU | `account_id` omitted or set to the parent MID | Set `account_id` to the target child MID and re-issue the token |
| Intermittent auth throttling under load | A token is being requested per send | Fix the cache (section 4) — this is an application bug, not an SFMC outage |

Rule for callers: **one auth retry, then surface the failure.** A booking confirmation that cannot be sent should be logged and queued by the booking system (Day 3 covers the SFMC-side logging pattern) — not retried in a tight loop against the auth endpoint.

## 7. SOAP note

The same Installed Package credentials are used for SOAP API work (for example, retrieving or managing objects SFMC's REST API does not cover). SOAP calls authenticate with the same access token in the SOAP header (`fueloauth`). This kit's Day 1 work is REST-only; the SOAP surface is named here so the package is set up once, correctly, instead of a second package being created later.
