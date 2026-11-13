<%%--
  ============================================================================
  QuickStay Hotels — Order (Booking) Lookup + Confirmation Re-send CloudPage
  Day 2 of the Transactional & Journey API Integration Kit.

  PERSONAL PORTFOLIO BUILD — fictional brand, fictional data. Not employer
  work. No real credentials anywhere in this file: the Installed Package
  client id/secret are read from the placeholder variables in the CONFIG
  block below, which in a real MID would be replaced by values pulled from a
  secure store at publish time — never committed with real values.

  HOW THIS FILE IS USED
  This is the complete HTML resource of one CloudPage. Paste it into a
  CloudPages HTML page (or a Code Resource + landing page pair). It mixes:
    - AMPscript  — request handling, DE lookups, form state, display logic.
                   AMPscript runs first and is where the booking lookup
                   itself happens, so a plain page view never needs SSJS.
    - SSJS       — only for the re-send action: getting a server-to-server
                   token and calling the Transactional Messaging API.
                   HTTP calls + token handling are SSJS's job in this kit;
                   lookups and rendering are AMPscript's.

  WHAT THE PAGE DOES
  1. Guest enters a booking reference (QS-#####) and the email used for the
     reservation.
  2. AMPscript validates the reference format, then looks the reservation up
     in QS_Reservations by BOTH fields. The pair must match — the reference
     alone is a guessable sequence, the email alone proves nothing.
  3. Booking found: the page shows the stay summary (property, dates, room)
     and, for an active booking, a "Re-send my confirmation" button.
  4. Re-send: SSJS checks QS_Resend_Log for throttle abuse, gets a cached-
     style OAuth token, and posts a fresh send to Day 1's
     quickstay-booking-confirmation definition with a NEW messageKey
     sequence number, then logs the re-send.
  5. Booking not found / pair mismatch: ONE generic message. The page never
     says which field was wrong — "no match for that reference" and "email
     doesn't match that reference" answering differently would let anyone
     enumerate which references exist.

  DATA EXTENSIONS THIS PAGE EXPECTS (schemas summarised in README.md here)
    QS_Reservations  — one row per reservation version (source of truth the
                       booking system syncs into SFMC)
    QS_Resend_Log    — one row per re-send: ReservationId, EmailAddress,
                       ResendSequence, RequestedAt

  RESEND THROTTLE
  Max 1 re-send per reservation per 15 minutes, max 3 per reservation per
  day, counted from QS_Resend_Log. Over the limit, the page says so plainly
  and does not call the API.
  ============================================================================
--%%><%%

/* ---------------------------------------------------------------------------
   CONFIG — placeholders only. In a real MID these come from the tenant's
   Installed Package + a secure configuration DE, never hard-coded secrets
   committed to a repo. They are variables here so the shape is visible.
--------------------------------------------------------------------------- */
SET @authBaseUrl   = "{{auth_base_url}}"        /* <subdomain>.auth.marketingcloudapis.com */
SET @restBaseUrl   = "{{rest_base_url}}"        /* from the token response: rest_instance_url */
SET @clientId      = "{{client_id}}"            /* Installed Package — secret store only */
SET @clientSecret  = "{{client_secret}}"        /* Installed Package — secret store only */
SET @accountId     = "{{account_id}}"           /* target MID */
SET @definitionKey = "quickstay-booking-confirmation"   /* Day 1 send definition */

/* ---------------------------------------------------------------------------
   REQUEST HANDLING (AMPscript)
--------------------------------------------------------------------------- */
SET @bookingRef = Trim(RequestParameter("bookingRef"))
SET @email      = Trim(RequestParameter("email"))
SET @action     = RequestParameter("action")            /* "" = lookup, "resend" = re-send */
SET @submitted  = Iif(Empty(@bookingRef) == false OR Empty(@email) == false, true, false)
SET @found      = false
SET @message    = ""

IF @submitted THEN

  /* --- Validation ---------------------------------------------------------
     Reference format: QS- followed by 4-6 digits (e.g. QS-84213).
     RegExMatch returns the matched text or an empty string. ------------- */
  SET @refMatch = RegExMatch(@bookingRef, "^QS-[0-9]{4,6}$", 0)
  SET @emailOk  = Iif(IndexOf(@email, "@") > 1 AND IndexOf(@email, ".") > 3, true, false)

  IF Empty(@refMatch) OR @emailOk == false THEN
    SET @message = "Please enter the booking reference exactly as it appears on your confirmation (for example QS-84213) and the email address you booked with."
  ELSE

    /* --- Lookup: BOTH fields must match the same row ----------------------
       LookupRows on the pair, not two separate lookups: the page must not
       learn "the reference exists" independently of "the email matches". - */
    SET @rows = LookupRows("QS_Reservations", "ReservationId", @bookingRef, "EmailAddress", @email)
    SET @rowCount = RowCount(@rows)

    IF @rowCount == 1 THEN
      SET @row             = Row(@rows, 1)
      SET @reservationId   = Field(@row, "ReservationId")
      SET @guestFirstName  = Field(@row, "GuestFirstName")
      SET @propertyName    = Field(@row, "PropertyName")
      SET @checkInDate     = Field(@row, "CheckInDate")
      SET @checkOutDate    = Field(@row, "CheckOutDate")
      SET @roomType        = Field(@row, "RoomType")
      SET @status          = Field(@row, "ReservationStatus")
      SET @found           = true
    ELSE
      /* One generic answer for "no such reference", "email mismatch" and
         (data problem) "more than one row" alike. See header note 5. */
      SET @message = "We couldn't find a booking matching that reference and email address. Check both and try again — the reference is on your confirmation email."
    ENDIF
  ENDIF
ENDIF
]%%><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>QuickStay Hotels — Find your booking</title>
</head>
<body>
  <h1>Find your booking</h1>
  <p>Enter your booking reference and the email address you booked with.</p>

  <form method="post" action="%%=RequestParameter('PAGEURL')=%%">
    <label>Booking reference
      <input type="text" name="bookingRef" value="%%=v(@bookingRef)=%%" placeholder="QS-84213" required>
    </label>
    <label>Email address
      <input type="email" name="email" value="%%=v(@email)=%%" required>
    </label>
    <button type="submit">Look up my booking</button>
  </form>

  %%[ IF Not Empty(@message) THEN ]%%
    <p role="alert">%%=v(@message)=%%</p>
  %%[ ENDIF ]%%

  %%[ IF @found THEN ]%%
    <section>
      <h2>%%[ IF @status == "Cancelled" THEN ]%%This booking was cancelled%%[ ELSE ]%%Your stay, %%=v(@guestFirstName)=%%%%[ ENDIF ]%%</h2>
      <p><strong>%%=v(@propertyName)=%%</strong><br>
      %%=FormatDate(@checkInDate, "dddd, MMMM d, yyyy")=%% &rarr; %%=FormatDate(@checkOutDate, "dddd, MMMM d, yyyy")=%%<br>
      %%=v(@roomType)=%% &middot; Reference %%=v(@reservationId)=%%</p>

      %%[ IF @status != "Cancelled" THEN ]%%
        <form method="post" action="%%=RequestParameter('PAGEURL')=%%">
          <input type="hidden" name="bookingRef" value="%%=v(@reservationId)=%%">
          <input type="hidden" name="email" value="%%=v(@email)=%%">
          <input type="hidden" name="action" value="resend">
          <button type="submit">Re-send my confirmation email</button>
        </form>
      %%[ ELSE ]%%
        <p>A cancelled booking has no confirmation to re-send. If you cancelled by mistake, please book again or contact the property.</p>
      %%[ ENDIF ]%%
    </section>
  %%[ ENDIF ]%%

%%[ IF @found AND @action == "resend" AND @status != "Cancelled" THEN ]%%
<script runat="server">
  /* -----------------------------------------------------------------------
     RE-SEND (SSJS) — runs only on an explicit resend post for a found,
     active booking. AMPscript already validated the pair above; SSJS's job
     is the API call, which AMPscript should not be doing: auth + HTTP are
     the server-to-server pattern from docs/oauth2-server-to-server-flow.md.
  ----------------------------------------------------------------------- */
  Platform.Load("Core", "1");

  var reservationId  = Variable.GetValue("@reservationId");
  var emailAddress   = Variable.GetValue("@email");
  var guestFirstName = Variable.GetValue("@guestFirstName");
  var propertyName   = Variable.GetValue("@propertyName");
  var checkInDate    = Variable.GetValue("@checkInDate");
  var checkOutDate   = Variable.GetValue("@checkOutDate");
  var roomType       = Variable.GetValue("@roomType");

  var AUTH_BASE   = Variable.GetValue("@authBaseUrl");
  var REST_BASE   = Variable.GetValue("@restBaseUrl");
  var CLIENT_ID   = Variable.GetValue("@clientId");
  var CLIENT_SEC  = Variable.GetValue("@clientSecret");
  var ACCOUNT_ID  = Variable.GetValue("@accountId");
  var DEF_KEY     = Variable.GetValue("@definitionKey");

  function setOutcome(kind, text) {
    Variable.SetValue("@resendOutcome", kind);
    Variable.SetValue("@resendText", text);
  }

  try {
    /* --- Throttle: count this reservation's re-sends from the log DE --- */
    var logRows = DataExtension["QS_Resend_Log"].Rows.Retrieve({
      Property: "ReservationId", SimpleOperator: "equals", Value: reservationId
    });
    var now = new Date();
    var inLast15Min = 0, inLast24h = 0, highestSeq = 0;
    for (var i = 0; i < logRows.length; i++) {
      var ageMs = now - new Date(logRows[i].RequestedAt);
      if (ageMs < 15 * 60 * 1000) inLast15Min++;
      if (ageMs < 24 * 60 * 60 * 1000) inLast24h++;
      if (logRows[i].ResendSequence > highestSeq) highestSeq = logRows[i].ResendSequence;
    }

    if (inLast15Min >= 1 || inLast24h >= 3) {
      setOutcome("throttled",
        "You've already re-sent this confirmation recently. Please check your inbox (and spam folder) — if it still hasn't arrived in a few minutes, contact the property and quote your reference.");
    } else {
      /* --- Token: server-to-server, same flow as Day 1. A CloudPage is a
             short-lived request, so there is no cross-request cache here —
             the honest cost of that is one token call per re-send, which
             the throttle above keeps rare. Batch senders must cache; see
             docs/oauth2-server-to-server-flow.md §4. --- */
      var tokenResp = HTTP.Post(
        "https://" + AUTH_BASE + "/v2/token",
        "application/json",
        Stringify({
          grant_type: "client_credentials",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SEC,
          account_id: ACCOUNT_ID,
          scope: "email_send"
        }),
        ["Accept"], ["application/json"] // header name/value arrays per SSJS HTTP.Post signature in use
      );
      var token = Platform.Function.ParseJSON(tokenResp.Response[0]).access_token;

      /* --- Send: NEW messageKey sequence — a re-send is a NEW event (the
             guest asked again), not a retry of the original send, so it
             takes the next RESEND sequence rather than reusing CONF-<n>.
             Convention: QS-<ReservationId>-RESEND-<seq> --- */
      var seq = highestSeq + 1;
      var messageKey = "QS-" + reservationId + "-RESEND-" + seq;

      var sendResp = HTTP.Post(
        "https://" + REST_BASE + "/messaging/v1/email/messages/" + messageKey,
        "application/json",
        Stringify({
          definitionKey: DEF_KEY,
          recipient: {
            contactKey: "guest-" + emailAddress,
            email: emailAddress,
            attributes: {
              ReservationId: reservationId,
              GuestFirstName: guestFirstName,
              PropertyName: propertyName,
              CheckInDate: checkInDate,
              CheckOutDate: checkOutDate,
              RoomType: roomType
            }
          }
        }),
        ["Authorization"], ["Bearer " + token]
      );

      var statusCode = sendResp.StatusCode;
      if (statusCode == 202) {
        /* Log BEFORE reporting success — the log is the throttle's memory
           and the support trail for "I never got it". */
        DataExtension["QS_Resend_Log"].Rows.Add({
          ReservationId: reservationId,
          EmailAddress: emailAddress,
          ResendSequence: seq,
          RequestedAt: now,
          MessageKey: messageKey
        });
        setOutcome("sent",
          "Done — a fresh copy of your confirmation is on its way to " + emailAddress + ".");
      } else {
        /* Never show the guest a raw API error; log the shape of it for
           debugging (status + messageKey, NOT the token or the payload). */
        Platform.Function.LogMessage(
          "QuickStay resend failed: status=" + statusCode + " messageKey=" + messageKey, "ERROR");
        setOutcome("failed",
          "Something went wrong re-sending your confirmation. Your booking itself is fine — please try again in a few minutes or contact the property.");
      }
    }
  } catch (e) {
    /* Last-resort guard: a CloudPage error page helps nobody at midnight
       before a flight. Same plain message as an API failure. */
    setOutcome("failed",
      "Something went wrong re-sending your confirmation. Your booking itself is fine — please try again in a few minutes or contact the property.");
  }
</script>
  %%[ IF @resendOutcome == "sent" THEN ]%%
    <p role="status">%%=v(@resendText)=%%</p>
  %%[ ELSEIF @resendOutcome == "throttled" OR @resendOutcome == "failed" THEN ]%%
    <p role="alert">%%=v(@resendText)=%%</p>
  %%[ ENDIF ]%%
%%[ ENDIF ]%%

  <p><small>QuickStay Hotels — fictional demo brand. Personal portfolio build; no real bookings exist behind this page.</small></p>
</body>
</html>
