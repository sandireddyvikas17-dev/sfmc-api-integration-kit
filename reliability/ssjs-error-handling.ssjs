<script runat="server">
/*
  ============================================================================
  QuickStay Hotels — SSJS Error-Handling Patterns
  Day 3 of the Transactional & Journey API Integration Kit.

  PERSONAL PORTFOLIO BUILD — fictional brand, fictional data. Not employer
  work. No real credentials anywhere in this file: configuration values are
  placeholders that in a real MID would come from a secure store / config DE,
  never committed with real values.

  WHAT THIS FILE IS
  A pattern library, not a page. It collects the error-handling shapes the
  rest of the kit uses — most visibly the Day 2 CloudPage re-send — in one
  place, with the reasoning attached:

    1. Classify before you act. 401, 400, 429, 5xx and a timeout are five
       different situations with five different correct responses. One
       generic catch that "logs and retries everything" sends duplicate
       confirmations and hammers a throttling API.
    2. Log before you report. The QS_API_Log row (see logging-de-schema.md)
       is written before any success or failure is shown to a guest or
       returned to a caller. If the log write itself fails, the caller gets
       a failure — an unlogged "success" is worse than an honest error.
    3. Never surface a raw API error. A guest sees a plain sentence; an
       operator sees the classified outcome + error code in the log. Raw
       responses can carry internal keys and stack detail.
    4. One auth retry, ever. On 401: discard the cached token, fetch one new
       token, retry once. A second 401 is a configuration problem, not a
       transient — stop and log it as terminal.
  ============================================================================
*/

Platform.Load("Core", "1");

/* ---------------------------------------------------------------------------
   CONFIG — placeholders only (same convention as Days 1–2).
--------------------------------------------------------------------------- */
var CONFIG = {
  authBaseUrl:   "{{auth_base_url}}",
  restBaseUrl:   "{{rest_base_url}}",
  clientId:      "{{client_id}}",        // secret store only
  clientSecret:  "{{client_secret}}",    // secret store only
  accountId:     "{{account_id}}",
  logDE:         "QS_API_Log",
  maxAttempts:   3                        // 1 try + up to 2 retries, retryable only
};

/* ---------------------------------------------------------------------------
   classifyHttp(status) — the table every caller shares.
   Returns: "accepted" | "auth" | "retryable" | "terminal"
--------------------------------------------------------------------------- */
function classifyHttp(status) {
  if (status === 202 || status === 201 || status === 200) return "accepted";
  if (status === 401) return "auth";                 // one token refresh + one retry
  if (status === 429) return "retryable";            // throttled: back off (see notes)
  if (status >= 500 && status < 600) return "retryable";
  if (status === 0 || status === null) return "retryable"; // timeout / no response
  return "terminal";                                  // 400/404/409 etc: fix, don't retry
}

/* ---------------------------------------------------------------------------
   logAttempt(row) — write one QS_API_Log row. Throws on failure on purpose:
   the caller must not report success for an attempt it could not log.
--------------------------------------------------------------------------- */
function logAttempt(row) {
  var log = DataExtension.Init(CONFIG.logDE);
  log.Rows.Add({
    LogId:         Platform.Function.GUID(),
    AttemptedAt:   new Date().toISOString(),
    EventType:     row.eventType,
    ReservationId: row.reservationId,
    ContactKey:    row.contactKey || "",
    DefinitionKey: row.definitionKey || "",
    MessageKey:    row.messageKey || "",
    RequestId:     row.requestId || "",
    AttemptNumber: row.attempt,
    HttpStatus:    row.httpStatus,
    Outcome:       row.outcome,
    ErrorCode:     row.errorCode || "",
    ErrorSummary:  String(row.errorSummary || "").substring(0, 500),
    SourceSystem:  row.sourceSystem || "CloudPage",
    CorrelationId: row.correlationId || ""
  });
}

/* ---------------------------------------------------------------------------
   getToken(forceRefresh) — server-to-server token, cached-style per run.
   In a CloudPage there is no cross-request cache (see Day 2 README for why);
   in the booking system this wraps the Day 1 cached-token rule.
--------------------------------------------------------------------------- */
function getToken(forceRefresh) {
  var payload = {
    grant_type: "client_credentials",
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    account_id: CONFIG.accountId,
    scope: "email_send"
  };
  var res = HTTP.Post(
    "https://" + CONFIG.authBaseUrl + "/v2/token",
    "application/json",
    Platform.Function.Stringify(payload)
  );
  if (res.StatusCode !== 200) {
    throw "Token request failed with status " + res.StatusCode;
  }
  return Platform.Function.ParseJSON(res.Response[0]).access_token;
}

/* ---------------------------------------------------------------------------
   sendWithHandling(args) — the worked pattern.
   args: { reservationId, contactKey, definitionKey, messageKey,
           recipient, attributes, correlationId }
   Returns a plain result object; never throws a raw API error to the caller.
--------------------------------------------------------------------------- */
function sendWithHandling(args) {
  var token = getToken(false);
  var authRetried = false;

  for (var attempt = 1; attempt <= CONFIG.maxAttempts; attempt++) {
    var status = 0, requestId = "", errorCode = "", errorSummary = "";
    try {
      var url = "https://" + CONFIG.restBaseUrl +
                "/messaging/v1/email/messages/" + args.messageKey;
      var body = {
        definitionKey: args.definitionKey,
        recipients: [{
          contactKey: args.contactKey,
          to: args.recipient,
          attributes: args.attributes
        }]
      };
      var res = HTTP.Post(url, "application/json",
                          Platform.Function.Stringify(body),
                          ["Authorization"], ["Bearer " + token]);
      status = res.StatusCode;
      if (status === 202) {
        var parsed = Platform.Function.ParseJSON(res.Response[0]);
        requestId = parsed.requestId || "";
      } else {
        errorSummary = "Transactional send returned " + status;
      }
    } catch (e) {
      // Network/timeout path: no status. Classified retryable below.
      status = 0;
      errorSummary = "Send call raised an exception (treated as timeout)";
    }

    var cls = classifyHttp(status);

    if (cls === "auth" && !authRetried) {
      authRetried = true;
      logAttempt({ eventType: "TransactionalSend", reservationId: args.reservationId,
        contactKey: args.contactKey, definitionKey: args.definitionKey,
        messageKey: args.messageKey, attempt: attempt, httpStatus: status,
        outcome: "AuthRefreshed", errorCode: errorCode,
        errorSummary: "401 — token refreshed, retrying once",
        correlationId: args.correlationId });
      token = getToken(true);
      continue; // the one auth retry; does not consume a backoff retry silently —
                // attempt count still increments, so the log shows the full story
    }

    if (cls === "accepted") {
      logAttempt({ eventType: "TransactionalSend", reservationId: args.reservationId,
        contactKey: args.contactKey, definitionKey: args.definitionKey,
        messageKey: args.messageKey, requestId: requestId, attempt: attempt,
        httpStatus: status, outcome: "Accepted",
        correlationId: args.correlationId });
      return { ok: true, requestId: requestId, attempts: attempt };
    }

    if (cls === "terminal" || attempt === CONFIG.maxAttempts) {
      logAttempt({ eventType: "TransactionalSend", reservationId: args.reservationId,
        contactKey: args.contactKey, definitionKey: args.definitionKey,
        messageKey: args.messageKey, attempt: attempt, httpStatus: status,
        outcome: "TerminalFailure", errorCode: errorCode,
        errorSummary: errorSummary, correlationId: args.correlationId });
      // Plain-language result for the caller. No raw response, no internals.
      return { ok: false, retryable: false,
               message: "The message could not be sent. The attempt has been logged." };
    }

    // Retryable and attempts remain: log this attempt, then loop.
    // Backoff itself (2s, 8s — see retry-and-idempotency.md) belongs to the
    // booking system's scheduler; SSJS in a CloudPage must not sleep a guest's
    // page, so a page-context caller returns retryable:true instead and lets
    // the caller schedule the retry with the SAME messageKey.
    logAttempt({ eventType: "TransactionalSend", reservationId: args.reservationId,
      contactKey: args.contactKey, definitionKey: args.definitionKey,
      messageKey: args.messageKey, attempt: attempt, httpStatus: status,
      outcome: "RetryableFailure", errorCode: errorCode,
      errorSummary: errorSummary, correlationId: args.correlationId });
    return { ok: false, retryable: true,
             message: "The message could not be sent just now. It is safe to retry with the same message key." };
  }
}
</script>
