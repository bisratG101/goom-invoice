# CHAPA_NOTES.md

Comprehensive investigation and reference notes for the Chapa payment provider implementation based on official documentation, the Chapa Merchant Handbook, and `design.md` §9.

---

## 1. Official Documentation Reference URLs & Quoted Evidence

- **Accept Payments**: `https://developer.chapa.co/integrations/accept-payments`
  - Quoted parameters for initialization: `amount`, `currency`, `email`, `first_name`, `last_name`, `phone_number`, `tx_ref`, `callback_url`, `return_url`, `customization`
  - Quoted description of `callback_url`: A separate redirect/callback URL receiving query parameters (`trx_ref`, `ref_id`, `status`) via HTTP GET.
  - Quoted description of `return_url`: Front-end browser redirect page for the customer.
- **Verify Payments (v1)**: `https://developer.chapa.co/integrations/verify-payments`
  - Quoted endpoint: `GET https://api.chapa.co/v1/transaction/verify/{tx_ref}`
  - Quoted response fields: `status`, `message`, `data.status`, `data.amount`, `data.currency`, `data.tx_ref`, `data.reference`, `data.mode`
  - Quoted error codes:
    - `"Live secret keys can't be used to verify a test transaction"` (`401 Unauthorized`)
    - `"Test secret keys can't be used to verify a live transaction"` (`401 Unauthorized`)
- **Webhooks**: `https://developer.chapa.co/integrations/webhooks`
  - Quoted signature header: `x-chapa-signature` (HMAC-SHA256 of the event payload using the webhook secret)
  - Quoted event fields: `event`, `tx_ref`, `reference`, `status`, `amount`, `currency`
  - Quoted event names: `charge.success`, `charge.failed`, `charge.refunded`, `charge.reversed`
- **Merchant Handbook**: `https://developer.chapa.co/chapa-merchant-handbook`
  - Distinguishes `Chapa-Signature` as a signature of the secret key itself.
- **Test Mode vs. Live Mode**: `https://developer.chapa.co/integrations/test-mode-vs-live-mode`
  - Quoted key prefixes: Test keys start with `CHASECK_TEST-` (and `CHAPUBK_TEST-`); Live keys start with `CHASECK-`

---

## 2. Webhook Signatures: `x-chapa-signature` Exclusivity

### 2.1 Distinct Algorithms
- **`x-chapa-signature`**:
  - The official webhook event signature.
  - Formed as a lowercase hexadecimal HMAC-SHA256 digest of the **exact raw request body bytes** using `CHAPA_WEBHOOK_SECRET`.
- **`Chapa-Signature`**:
  - Described separately in the Chapa Merchant Handbook as an HMAC-SHA256 signature of the secret key itself.
  - Because its algorithm and purpose differ from the event-payload HMAC, **it is NOT interchangeable with `x-chapa-signature`**.

### 2.2 Strict Enforcement
- Our webhook verification will accept **only `x-chapa-signature`**.
- Any request lacking `x-chapa-signature` (or providing an invalid/tampered signature) is rejected with HTTP 401 without database mutation.
- We do **not** accept or fall back to `Chapa-Signature`.

---

## 3. URLs: `return_url`, `callback_url`, and Dashboard Webhooks

### 3.1 Documented Roles
1. **`return_url`**:
   - The browser URL where the customer is redirected after completing or canceling checkout.
   - Used purely for frontend UX: points to `${env.APP_BASE_URL}/invoices/public/${token}` (where the client polls `GET /public/invoices/:token/status` every 2s).
   - Never trusted as proof of payment.
2. **`callback_url`**:
   - Described in Chapa's Accept Payments documentation as a GET redirect/callback receiving query parameters (`trx_ref`, `ref_id`, `status`).
   - It is **not** a POST webhook endpoint. Pointing `callback_url` to our POST webhook handler (`/api/v1/webhooks/chapa`) would result in HTTP method mismatch errors (GET instead of POST).
3. **Dashboard Webhook**:
   - Configured in the Chapa Merchant Dashboard under **Settings > Webhooks**.
   - Chapa dispatches an asynchronous HTTP POST with the full JSON event payload and the `x-chapa-signature` header to this configured URL: `${env.API_BASE_URL}/api/v1/webhooks/chapa`.

### 3.2 Decision
- In `createCheckout`, we pass `return_url: input.returnUrl`.
- We **omit `callback_url`** from the initialization payload.
- All asynchronous server-to-server payment notifications are received exclusively via the configured dashboard webhook endpoint (`POST /api/v1/webhooks/chapa`), exactly as specified in `design.md` §9.

---

## 4. Retryable Verification Failures & Trace of Webhook Transaction

### 4.1 Trace of `webhook.service.ts` Execution
Let us trace the exact code in `backend/src/modules/payments/webhook.service.ts`:

1. **Step 2 (Signature Verification)**:
   ```typescript
   const isValidSignature = provider.verifySignature(rawBody, headers);
   if (!isValidSignature) {
     return { statusCode: 401, body: { error: { code: 'INVALID_SIGNATURE', ... } } };
   }
   ```
   *No database client opened; nothing written to database.*

2. **Step 3 (Event Parsing)**:
   ```typescript
   const event = provider.parseEvent(rawBody);
   if (event.type === 'ignored') {
     return { statusCode: 200, body: { status: 'ignored' } };
   }
   ```
   *No database client opened; nothing written to database.*

3. **Step 4 (Database Connection & BEGIN)**:
   ```typescript
   const client = await pool.connect();
   try {
     await client.query('BEGIN');
     const eventInsertRes = await client.query<{ id: string }>(
       `INSERT INTO payment_events (provider, event_key, event_type, payload)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (provider, event_key) DO NOTHING
        RETURNING id`,
       [provider.name, event.eventKey, event.type, JSON.stringify(rawJsonPayload)]
     );
   ```
   *The row in `payment_events` is inserted inside an open, uncommitted transaction.*

4. **Step 5 (Find Payment with `FOR UPDATE`)**:
   Payment row is locked.

5. **Step 6 (Verification Call)**:
   ```typescript
   if (event.type === 'payment.succeeded') {
     const verifyRes = await provider.verifyTransaction(event.txRef);
   ```
   - **Case A: Temporary network failure, Chapa 500, ETIMEDOUT, or malformed JSON**:
     - `provider.verifyTransaction()` throws an `Error`.
     - Execution immediately jumps out of the `try` block to the `catch` block:
       ```typescript
       } catch (err: any) {
         await client.query('ROLLBACK');
         logger.error('Failed to process webhook transaction', ...);
         return {
           statusCode: 500,
           body: { error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Failed to process webhook transaction' } },
         };
       } finally {
         client.release();
       }
       ```
     - **Verification of Rollback**:
       `await client.query('ROLLBACK')` executes. PostgreSQL completely discards the uncommitted transaction. The row in `payment_events` with `(provider, event_key)` is **completely eliminated**.
       The client connection is released.
       The HTTP response returned is **500**.
       When Chapa retries the webhook delivery later, `INSERT ... ON CONFLICT DO NOTHING` will successfully insert the row because the previous attempt was rolled back. The event key is **never consumed**.
   - **Case B: Definitive transaction failure from Chapa**:
     - Chapa API returns HTTP 200 with `status: "success"` and `data.status: "failed"`.
     - `verifyTransaction` returns `{ status: 'failed', amountMinor, currency }`.
     - `isVerified` evaluates to `false`.
     - Step 6 records `outcome = 'mismatch'`, commits the transaction, and returns HTTP 200 `{ status: 'mismatch' }`.

---

## 5. End-to-End Behavior Matrix

| Scenario | Incoming Request / Chapa API | `verifySignature` / `verifyTransaction` | Webhook Service Action | HTTP Status & Body | Database State |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Successful Payment** | POST with valid `x-chapa-signature`; Verify returns 200, `data.status: "success"`, amount/currency match | Signature valid; returns `{ status: 'success', amountMinor, currency }` | Locks payment & invoice; updates payment `succeeded`, invoice `paid`; commits | 200 `{ status: 'ok' }` | Payment `succeeded`, invoice `paid`, event `processed` |
| **Failed Payment** | POST with `charge.failed` and valid `x-chapa-signature` | Signature valid; `parseEvent` returns `type: 'payment.failed'` | Step 8: marks payment `failed`; invoice stays `sent`; commits | 200 `{ status: 'ok' }` | Payment `failed`, invoice `sent`, event `processed` |
| **Pending Payment** | POST with `charge.success`; Verify returns 200, `data.status: "pending"` | Returns `{ status: 'pending', amountMinor, currency }` | Step 6: `isVerified = false`; records outcome `mismatch`; commits | 200 `{ status: 'mismatch' }` | Invoice stays `sent`, event recorded as `mismatch` |
| **Wrong Amount / Currency** | POST with `charge.success`; Verify returns 200, but amount/currency differs from DB | Returns `{ status: 'success', amountMinor, currency }` | Step 6: `isVerified = false`; records outcome `mismatch`; commits | 200 `{ status: 'mismatch' }` | Invoice stays `sent`, event recorded as `mismatch` |
| **Duplicate Webhook** | Chapa retries identical event delivery | Signature valid; `eventKey` already exists | Step 4: `INSERT ON CONFLICT DO NOTHING` returns 0 rows; commits immediately | 200 `{ status: 'duplicate' }` | Unchanged; no duplicate processing |
| **Temporary Chapa API Failure** | Network timeout, Chapa 500, or ETIMEDOUT | `verifyTransaction` throws Error | Step 6 catch block: `ROLLBACK`; logs error | **500** `{ error: { code: 'WEBHOOK_PROCESSING_FAILED' } }` | **Rolled back!** `eventKey` NOT consumed; Chapa retries later |
| **Missing or Invalid Signature** | Missing or invalid `x-chapa-signature` (or `Chapa-Signature`) | `verifySignature` returns `false` | Step 2: logs warning; stops immediately | **401** `{ error: { code: 'INVALID_SIGNATURE' } }` | Nothing written to DB |
| **Unknown Event Type** | Event is `payout.success` or unrecognized | `parseEvent` returns `type: 'ignored'` | Step 3: logs info; stops immediately | **200** `{ status: 'ignored' }` | Nothing written to DB |
