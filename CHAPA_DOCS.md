# CHAPA_NOTES.md (summary of the official Chapa docs pages: Accept Payment, Verify Payment, Webhooks)

Source: pages copied by the owner from https://developer.chapa.co on 2026-10-26 (Accept Payment last updated
2026-09-01, Verify Payment 2025-03-19, Webhooks 2026-07-08). This file is a summary in my own words.
Items marked CONFIRM-IN-SANDBOX are not fully clear from the docs and must be tested with a real test payment.

## 1. Initialize a transaction
- `POST https://api.chapa.co/v1/transaction/initialize`
- Auth header: `Authorization: Bearer <secret key>` (test keys look like `CHASECK_TEST-...`). `Content-Type: application/json`.
- Body fields seen in the docs example:
  `amount` (string, major units, e.g. "10"), `currency` ("ETB"; USD also supported), `email`, `first_name`, `last_name`,
  `phone_number` (optional; if sent it must be 10 digits in 09xxxxxxxx or 07xxxxxxxx format; required only for "risky businesses"),
  `tx_ref` (OUR unique reference), `callback_url`, `return_url`, `customization { title, description }`, `meta`.
- The parameter table was truncated in the copy, but the example always includes `email`, so keep treating `email` as REQUIRED.
- The response contains the checkout link at `data.checkout_url`. Redirect the payer there.
- Success response (from the docs): top-level `message` ("Hosted Link"), `status` ("success"), and `data.checkout_url`.
- Failed response example in the docs: `message` ("Authorization required"), `status` ("failed"), `data` is `null`.
  That example is an auth error. The shape of validation errors (bad amount, duplicate `tx_ref`) was not shown: CONFIRM-IN-SANDBOX.
- Code rule: treat the call as successful ONLY if `status === "success"` AND `data?.checkout_url` is a non-empty string.
  Anything else is an error (never read `data.checkout_url` without checking `data` is not null). Never log the Authorization header.
- Amount: send a decimal STRING in major units. Convert from our integer minor units with integer string formatting
  (e.g. 125050 minor -> "1250.50"), never with floats.

## 2. After payment
- Chapa redirects the payer to `return_url` (we use our frontend page `/i/:token/return`, which only polls our own status endpoint).
- `callback_url` receives a GET with `trx_ref`, `ref_id`, `status`. NOTE the spelling `trx_ref` here versus `tx_ref` elsewhere.
  We do NOT rely on the callback or the redirect as proof of payment. Only the verified webhook/verify result counts.
- Failed payments can be retried by the payer up to 10 times inside a configurable window (default 60 minutes), under the SAME `tx_ref`.
  So a payment can fail and later succeed. Our payment status must allow `failed -> succeeded` (and `pending -> succeeded`).

## 3. Verify a transaction (server to server)
- `GET https://api.chapa.co/v1/transaction/verify/<tx_ref>` with the same bearer secret key.
- The docs' best-practice section says to re-query this endpoint before giving value and confirm that the
  status, amount, currency, tx_ref and mode all match what we expect.
- The exact response JSON was not copied (CONFIRM-IN-SANDBOX): expect top-level `status` and `data.status`; check
  where `amount`, `currency`, `tx_ref`, and `mode` live and write the real paths here after the first sandbox call.

## 4. Webhooks
- Set up in the Chapa dashboard: profile settings -> Webhooks tab: add the webhook URL and a SECRET HASH (any random string we choose; store as env var).
- Chapa POSTs JSON to our URL. Transaction event keys (from the docs example, event `charge.success`):
  `event`, `first_name`, `last_name`, `email` (can be null), `mobile`, `currency`, `amount` (string like "400.00"), `charge`, `status`,
  `mode` ("live" or "test"), `reference` (Chapa's own reference), `created_at`, `updated_at`, `type` (e.g. "API"),
  `tx_ref` (OUR reference), `payment_method`, `customization`, `meta`.
- Payout events (`payout.success`, `"type": "Payout"`) exist too: ignore them (respond 200) in this app.
- Failure/cancel event names are NOT shown on this page. Do not depend on them: a payment stays `pending` until a verified success arrives.
- Signature headers (two of them, either valid one is enough; if neither is present or neither matches, discard the request):
  - `x-chapa-signature`: HMAC-SHA256 of the event payload.
  - `chapa-signature`: HMAC-SHA256 of the secret, keyed with itself.
  - The docs word the key as "your secret key"; the dashboard calls it the "secret hash". CONFIRM-IN-SANDBOX which one it is.
    Write the code so the signing secret comes from one env var (`CHAPA_WEBHOOK_SECRET`) and test it with the secret hash first.
  - The docs' sample hashes `JSON.stringify(req.body)`. Our design verifies over the raw bytes, which is safer.
    CONFIRM-IN-SANDBOX that raw-byte verification matches on a real test webhook. If it does not, investigate before changing anything.
- Compare signatures with a timing-safe comparison.
- Acknowledge with HTTP 200. If we do not return 200, Chapa retries every 10 minutes, up to 10 attempts over 72 hours.
  So returning 500 on a transient error is correct, and a sleeping free-tier server is less risky than I assumed (retries follow).
- The same event can be delivered more than once: processing must be idempotent.
- There is no unique event id in the payload shown, so the idempotency key is built from stable fields:
  `eventKey = event + ":" + tx_ref + ":" + reference`.

## 5. Decisions for our code (summary)
1. `parseEvent` extracts `event`, `tx_ref`, `reference`, `mode`; ignore anything that is not a transaction success event (respond 200).
2. After signature + idempotency checks, ALWAYS call the verify endpoint and require: success status, amount equal to our stored
   amount (integer compare after string parsing), same currency, `tx_ref` equal to ours, and `mode` consistent with the key in use
   (a `CHASECK_TEST-` key must only ever accept `test`).
3. Never read amount or status from the webhook body as the source of truth; the verify response is the source of truth.
4. Payer email is sent to Chapa for that request only. Never stored in a new column, never logged, never returned publicly.
5. Chapa test mode works before compliance approval; live mode does not. Test keys cannot verify live transactions and vice versa.

## 6. Still to do before Prompt 9 is complete
- [ ] Copy the "Successful Response" and "Failed Response" tabs for Initialize and for Verify into this file.
- [ ] Copy the Testing Cards / Testing Mobile pages (needed for the first sandbox payment, Prompt 19).
- [ ] After the first deploy: register the webhook URL and secret hash in the dashboard, run one test payment, and resolve every CONFIRM-IN-SANDBOX item above.
