# Goom Invoice: Invoicing & Payments App. Design Document (V1)

> Replace `APP_NAME` everywhere once you pick a name. This file is the single source of truth.
> Antigravity: read this file fully before every task. Do not deviate from it. If something is
> unclear or missing, STOP and ask instead of guessing.
> This is a NEW project in its own folder. Do not mix it with the booking-system repo.

---

## 0. How this document is organised

1. Product summary
2. Users and permissions
3. Scope: V1, non-goals, stretch
4. Key decisions
5. Architecture and environment
6. Data model
7. Business rules
8. API
9. Payments design
10. Security checklist
11. Testing strategy
12. UI/UX design (Grey-inspired)
13. Deployment and operations
14. README outline and "hardest problems"
15. Assumptions to verify

---

## 1. Product summary

**Problem.** Freelancers and small businesses write invoices by hand, chase payments in chat, and
cannot see at a glance who has paid.

**Solution.** A web app where a business owner creates invoices, shares a secure link, the payer
pays online, and the invoice is marked paid automatically when the payment provider confirms it.

**Portfolio purpose.** This project exists to show clients four things:
1. Money is handled correctly (integers, server-side totals, no rounding surprises).
2. Payment webhooks are handled correctly (signature check, duplicates ignored, amount verified).
3. Each business can only ever see its own data.
4. A polished, modern interface comparable to consumer finance apps.

**Honesty rule.** Payments run in **test mode** (Chapa sandbox + a simulated provider). No real money
moves. The landing page and README must say so. No invented testimonials, no invented statistics.

---

## 2. Users and permissions

| Actor | Has account | Can do |
|---|---|---|
| Business owner | Yes (one business per owner) | Manage own clients, invoices, settings, dashboard; see own payments |
| Payer | No | Open a public invoice link, view that one invoice, pay it, download its PDF |
| System (provider webhook) | No | Call the webhook endpoint with a valid signature |

There is no platform-admin role in V1.

Rules that must never be violated:
- An owner can never read or change another business's data.
- The owner's `business_id` always comes from the database via the authenticated user, never from
  the request body, query string, or URL.
- A payer link exposes exactly one invoice and nothing else (no client email lists, no other invoices).

---

## 3. Scope

### V1 features
1. Register and login (JWT, 1 hour). Registering creates the user AND their business in one transaction.
2. Clients: create, edit, archive, list, search.
3. Invoices: line items, tax rate, currency (ETB or USD), issue/due dates, notes.
   Lifecycle: `draft -> sent -> paid`, and `sent -> void`. "Overdue" is derived, not stored.
4. Invoice numbers: sequential per business, assigned when the invoice is sent (not for drafts).
5. Public invoice page at an unguessable link with a Pay button.
6. Payments through a provider interface: Chapa (test mode) and a Simulated provider (for the demo).
7. Webhook marks the invoice paid (signature check, idempotency, amount verification, one transaction).
8. PDF download of an invoice (owner and public link).
9. Dashboard: outstanding, overdue, paid this month, revenue per month, recent activity.
   Amounts are shown **per currency**, never summed across currencies.
10. Landing page (Grey-inspired) and a clean public invoice page.

### Non-goals (do not build)
Real money movement, partial payments, recurring invoices, refunds, multiple users per business,
tax compliance features, email sending, client accounts, multi-currency conversion,
platform-admin dashboard, subscriptions/billing for the app itself, Amharic UI, Ethiopian calendar.

### Stretch (only after everything else is done and tested)
"Describe it" box: the owner types a sentence such as
`Invoice Abebe 3 hours at 20 USD, due in 14 days`. The server asks an LLM for structured JSON,
validates it with Zod, and creates a **draft** that the owner reviews. API key stays on the server,
with rate limits and a spending cap. The LLM never sends or pays anything.

---

## 4. Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Database | PostgreSQL on Neon, ONE schema (`public`) | Simplicity; fewer migration problems |
| IDs | `uuid` (`gen_random_uuid()`) | Safe to expose, no enumeration |
| Money | Integer minor units (`bigint`), never floats | Exact arithmetic |
| Currencies | `ETB`, `USD` only (both 2 decimal places) | Matches Chapa's supported currencies |
| Tenancy | `business_id` on every business-owned table; composite foreign keys | Database refuses cross-business links |
| Auth | JWT bearer in `Authorization` header, 1 hour, no refresh tokens | Same pattern as the booking app |
| Passwords | bcrypt (10+ rounds) | Standard |
| Validation | Zod on every request body, query, and param | One schema per endpoint |
| Invoice numbers | Counter row per business, incremented inside the "send" transaction | No gaps, no duplicates under concurrency |
| Overdue | Derived: `status = 'sent' AND due_date < today (business timezone)` | Never stale |
| Public link | 32 random bytes, base64url, unique column | Unguessable |
| Payment providers | `PaymentProvider` interface; `chapa` and `simulated` | Provider can be swapped or added |
| Webhook idempotency | `payment_events` table with unique `(provider, event_key)` | Duplicates are no-ops |
| PDF | Server-side with `pdfkit` | No headless browser; works on Render free tier |
| Frontend | React 19, TypeScript, Vite, Tailwind v4, React Router, TanStack Query, react-hook-form + zod | Same family as previous projects |
| CSS layering | `tokens.css` is the single source of truth for all colours, radii, shadows, and motion values. All token values are mapped into Tailwind v4 via `@theme` so Tailwind utilities resolve to the same CSS custom properties. Dark mode is applied by toggling `data-theme="dark"` on `<html>`. Never use Tailwind built-in colour utilities (`bg-blue-*`, `text-red-*`) directly; always reference `--ink-*`, `--blue-*`, `--surface-*` etc. | Allows the dark-theme token swap to work regardless of which utility or component applied the colour |
| Charts | `recharts`, lazy-loaded | Keeps the first load small |
| Hosting | Neon (DB), Render (API), Vercel (web) | Free tiers |
| Free-tier caveat | Render sleeps when idle | Documented in README; the demo uses the Simulated provider |

---

## 5. Architecture and environment

### Repository layout
```
APP_NAME/
  design.md
  prompts.md
  README.md
  render.yaml
  backend/
    migrations/001_initial.sql
    src/
      config/env.ts            # Zod-validated environment
      db/pool.ts, migrate.ts
      middleware/              # auth, requireOwner (resolves req.business), errorHandler, rateLimit
      utils/money.ts           # integer math, BigInt for intermediates
      modules/
        auth/  business/  clients/  invoices/  dashboard/  public/
        payments/
          providers/ types.ts, chapa.ts, simulated.ts, index.ts
          webhook.ts
        pdf/
        ai/                    # stretch
      scripts/seedDemo.ts
      app.ts, server.ts
  frontend/
    vercel.json
    src/
      app/ (router, providers)
      components/ui/ (Button, Card, Input, Badge, Skeleton, EmptyState, Toast, ...)
      components/layout/ (Sidebar, BottomNav, Header, PublicLayout)
      features/ auth/ dashboard/ clients/ invoices/ public/ landing/
      lib/ api.ts, format.ts, money.ts
      styles/ tokens.css, globals.css
```

### Environment variables
Backend:
```
NODE_ENV=development|production
PORT=4000
DATABASE_URL=            # Neon, sslmode=require
JWT_SECRET=              # 32+ random chars
JWT_EXPIRES_IN=1h
CORS_ORIGIN=             # exact frontend origin, https, no trailing slash
APP_BASE_URL=            # public frontend URL (used to build invoice links)
API_BASE_URL=            # public API URL (used for provider callbacks)
PAYMENT_PROVIDERS=chapa,simulated
CHAPA_SECRET_KEY=        # test key while in test mode
CHAPA_WEBHOOK_SECRET=    # from the Chapa dashboard
DEMO_MODE=true|false     # enables the simulated provider and demo seed
SIMULATED_WEBHOOK_SECRET=
LLM_API_KEY=             # stretch only
```
Frontend:
```
VITE_API_URL=            # e.g. https://<service>.onrender.com/api/v1  (no trailing slash)
VITE_APP_NAME=
VITE_DEMO_MODE=          # true|false — shows/hides the "View live demo" button and /demo route
```
Never commit `.env`. Provide `.env.example` with names only.

---

## 6. Data model

```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text   NOT NULL,
  name          text   NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE businesses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  default_currency text NOT NULL DEFAULT 'ETB' CHECK (default_currency IN ('ETB','USD')),
  invoice_prefix   text NOT NULL DEFAULT 'INV' CHECK (invoice_prefix ~ '^[A-Z0-9]{1,8}$'),
  timezone         text NOT NULL DEFAULT 'Africa/Addis_Ababa',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  email       citext,
  phone       text,
  address     text CHECK (length(address) <= 300),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, business_id)
);
CREATE INDEX clients_business_name_idx ON clients (business_id, name);

CREATE TABLE invoice_counters (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL,
  number         integer,                                  -- NULL while draft
  currency       text NOT NULL CHECK (currency IN ('ETB','USD')),
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  issue_date     date NOT NULL,
  due_date       date NOT NULL,
  tax_rate_bps   integer NOT NULL DEFAULT 0 CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  tax_minor      bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor    bigint NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  notes          text CHECK (length(notes) <= 1000),
  public_token   text NOT NULL UNIQUE,
  sent_at        timestamptz,
  paid_at        timestamptz,
  voided_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, business_id) REFERENCES clients (id, business_id),
  UNIQUE (id, business_id),
  UNIQUE (business_id, number),                            -- multiple NULLs allowed (drafts)
  CHECK (due_date >= issue_date),
  CHECK (total_minor = subtotal_minor + tax_minor),
  CHECK (status = 'draft' OR number IS NOT NULL)
);
CREATE INDEX invoices_business_status_due_idx ON invoices (business_id, status, due_date);
CREATE INDEX invoices_business_created_idx    ON invoices (business_id, created_at DESC);

CREATE TABLE invoice_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position         integer NOT NULL CHECK (position >= 1),
  description      text NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  quantity_milli   integer NOT NULL CHECK (quantity_milli BETWEEN 1 AND 1000000), -- 1000 = 1.000
  unit_price_minor bigint  NOT NULL CHECK (unit_price_minor BETWEEN 0 AND 1000000000),
  line_total_minor bigint  NOT NULL CHECK (line_total_minor >= 0),
  UNIQUE (invoice_id, position)
);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL,
  invoice_id   uuid NOT NULL,
  provider     text NOT NULL CHECK (provider IN ('chapa','simulated')),
  tx_ref       text NOT NULL,                              -- our reference sent to the provider
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency     text NOT NULL CHECK (currency IN ('ETB','USD')),
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','succeeded','failed','cancelled')),
  failure_reason text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  FOREIGN KEY (invoice_id, business_id) REFERENCES invoices (id, business_id),
  UNIQUE (provider, tx_ref)
);
CREATE INDEX payments_invoice_idx ON payments (invoice_id);
-- Backstop: the database refuses a second successful payment for one invoice.
CREATE UNIQUE INDEX payments_one_success_per_invoice ON payments (invoice_id) WHERE status = 'succeeded';

CREATE TABLE payment_events (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  event_key    text NOT NULL,                              -- deterministic per provider event
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  outcome      text,                                       -- processed | duplicate | mismatch | unknown_reference | ...
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, event_key)
);

CREATE TABLE schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
```

Notes:
- Every query that touches a business-owned table must filter by the owner's `business_id`.
- Store `payload` of webhook events with secrets removed (never store the signature secret).

---

## 7. Business rules

### Money
- All amounts are integers in minor units (1 ETB = 100 minor, 1 USD = 100 minor).
- The client never sends totals. The server computes every number.
- Use `BigInt` for intermediate multiplication in `utils/money.ts` to avoid exceeding 2^53.
- Line total: `round_half_up(quantity_milli * unit_price_minor / 1000)`.
- Subtotal: sum of line totals.
- Tax: `round_half_up(subtotal_minor * tax_rate_bps / 10000)`.
- Total: `subtotal_minor + tax_minor`.
- Limits: at most 50 line items; quantity 0.001 to 1000; total must fit comfortably in a JS safe integer.
- Parsing provider amounts (decimal strings like "100.00") must use string parsing into minor units,
  never `parseFloat * 100`.
- Display formatting happens only in the frontend (`Intl.NumberFormat`), e.g. `ETB 1,250.00`.

### Invoice lifecycle
| From | To | Trigger | Rules |
|---|---|---|---|
| draft | sent | Owner clicks Send | Needs at least one item and total > 0; assigns number in a transaction; sets `sent_at` |
| sent | paid | Verified webhook | Sets `paid_at`; immutable afterwards |
| sent | void | Owner clicks Void | Sets `voided_at`; number is kept (no gaps); payer page shows "cancelled" |
| draft | (deleted) | Owner deletes | Drafts can be deleted; sent/paid/void cannot |

- Only drafts can be edited. A mistake in a sent invoice = void it and create a new one.
- Overdue is derived at read time using the business timezone.
- Invoice display number: `{prefix}-{number padded to 4}` (e.g. `INV-0007`).

### Invoice numbering (the concurrency rule)
In one transaction: upsert the counter row, `UPDATE invoice_counters SET last_number = last_number + 1
WHERE business_id = $1 RETURNING last_number`, set it on the invoice, and change the status.
Two simultaneous "send" requests for different invoices must get different, consecutive numbers.

### Dashboard definitions (per currency)
- Outstanding: sum of `total_minor` where `status = 'sent'`.
- Overdue: subset of outstanding with `due_date < today` in the business timezone.
- Paid this month: `status = 'paid'` and `paid_at` within the current month in the business timezone.
- Revenue per month: last 6 months of paid totals, grouped by month, per currency.
- Recent activity: union of invoice events (sent, paid, voided) ordered by time, latest 10.

---

## 8. API

Base path `/api/v1`. All responses use JSON. Errors use `{ "error": { "code", "message", "details?" } }`.
Malformed JSON returns 400 `INVALID_JSON`. Validation errors return 422 with field details.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` (at root) | none | Includes database check |
| POST | `/auth/register` | none | Creates user + business in one transaction; rate-limited |
| POST | `/auth/login` | none | Generic 401 on failure; rate-limited |
| GET | `/auth/me` | owner | Returns user and business |
| GET/PATCH | `/business` | owner | Own business only (name, default currency, prefix, timezone) |
| GET/POST | `/clients` | owner | Search and pagination |
| GET/PATCH | `/clients/:id` | owner | 404 for other businesses' ids |
| POST | `/clients/:id/archive` | owner | Soft-delete: sets `archived_at`; invoice history is preserved; returns 204 |
| POST | `/clients/:id/unarchive` | owner | Clears `archived_at`; returns 200 with the updated client |
| GET | `/invoices` | owner | Filters: status (incl. `overdue`), clientId, q, page |
| POST | `/invoices` | owner | Creates a draft; server computes totals |
| GET | `/invoices/:id` | owner | Includes items and payments |
| PATCH | `/invoices/:id` | owner | Draft only |
| DELETE | `/invoices/:id` | owner | Draft only |
| POST | `/invoices/:id/send` | owner | Assigns number; returns public URL |
| POST | `/invoices/:id/void` | owner | Sent only |
| GET | `/invoices/:id/pdf` | owner | `application/pdf` |
| GET | `/dashboard/summary` | owner | Per-currency figures |
| GET | `/dashboard/revenue?months=6` | owner | Per-currency monthly series |
| GET | `/dashboard/activity` | owner | Latest events |
| GET | `/public/invoices/:token` | none | Sanitised invoice; only status sent/paid/void; rate-limited |
| GET | `/public/invoices/:token/status` | none | Small payload for polling |
| GET | `/public/invoices/:token/pdf` | none | PDF |
| POST | `/public/invoices/:token/pay` | none | Body `{ payerEmail?: string; payerFirstName?: string; payerLastName?: string; provider?: string }`. The server picks the active provider from `PAYMENT_PROVIDERS[0]` unless `provider` is supplied and is in the enabled list. For Chapa: if the invoice's client has a stored email it is used; otherwise `payerEmail` is required and validated. Payer data is forwarded to the provider and never stored or logged. Returns `{ checkoutUrl: string }` |
| POST | `/auth/demo` | none | `DEMO_MODE=true` only. Rate-limited (5 req/15 min per IP). Returns a short-lived JWT (same 1 h) for the demo account. No body required. Used by the "View live demo" CTA on the landing page. |
| POST | `/webhooks/chapa` | signature | Raw body; see section 9 |
| POST | `/webhooks/simulated` | signature | Same code path; demo mode only |
| POST | `/demo/simulated/:txRef/complete` | none, demo mode only | Server signs and posts a webhook to itself |
| POST | `/ai/draft-invoice` | owner | Stretch only |

Sanitised public invoice contains: business name, client name, invoice display number, dates, currency,
items, subtotal/tax/total, status. It must NOT contain business id, client email/phone, owner info,
or internal ids.

Authorization pattern: `requireOwner` loads `req.business` from `WHERE owner_id = req.user.id`.
Resource lookups are always `WHERE id = $1 AND business_id = $2`; a miss returns 404, never 403,
so ids of other businesses are not revealed.

---

## 9. Payments design

### Provider interface
```ts
type Currency = 'ETB' | 'USD';

interface CheckoutInput {
  txRef: string;
  amountMinor: number;
  currency: Currency;
  returnUrl: string;          // frontend page that polls status; NEVER trusted as proof of payment
  description: string;
  payer: { name: string; email: string };   // Chapa requires email. Simulated provider ignores it.
                                             // Source: client email from DB if set, else payerEmail from request body.
}

type ProviderEvent = {
  eventKey: string;           // deterministic, used for idempotency
  type: 'payment.succeeded' | 'payment.failed' | 'payment.cancelled' | 'ignored';
  txRef: string;
};

interface PaymentProvider {
  readonly name: 'chapa' | 'simulated';
  createCheckout(input: CheckoutInput): Promise<{ checkoutUrl: string }>;
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseEvent(rawBody: Buffer): ProviderEvent;
  verifyTransaction(txRef: string): Promise<{
    status: 'success' | 'failed' | 'pending';
    amountMinor: number;
    currency: Currency;
  }>;
}
```

### Pay flow
1. Payer opens `/i/:token`. Frontend calls `GET /public/invoices/:token`.
2. Payer clicks Pay. `POST /public/invoices/:token/pay` checks the invoice is `sent`.
   **Provider selection:** the server reads `PAYMENT_PROVIDERS` and uses the first entry as the default.
   If the request body contains `provider`, it is validated against the enabled list (422 if not found).
   In `DEMO_MODE`, the response also includes `{ demoCheckoutUrl }` for the Simulated provider so the
   UI can offer a secondary "Pay (demo)" option alongside the real provider.
   **Payer email:** the server reads the client's stored email from the database. If it is null and the
   Chapa provider is active, `payerEmail` from the request body is required (422 if missing or malformed).
   The email is forwarded to `createCheckout` and never stored or written to logs.
   The server creates a `payments` row (`pending`, random `tx_ref`, amount and currency copied from the
   invoice on the server), calls `provider.createCheckout`, returns `{ checkoutUrl }`. The frontend redirects.
3. After paying, the payer returns to `/i/:token/return`. That page shows "Confirming payment..." and
   polls `/public/invoices/:token/status` every 2 seconds for up to 30 seconds. It does not mark anything paid.
4. The provider calls our webhook. That is the only thing that can mark an invoice paid.

### Webhook algorithm (must be implemented exactly)
1. The webhook route uses `express.raw({ type: 'application/json' })` and is mounted BEFORE `express.json()`.
2. Verify the signature over the raw bytes with a timing-safe comparison. Invalid: respond 401, write nothing.
3. Parse the event. Unknown event types: respond 200 and stop.
4. Begin a transaction. `INSERT INTO payment_events ... ON CONFLICT (provider, event_key) DO NOTHING`.
   If nothing was inserted, it is a duplicate: commit and respond 200.
5. Find the payment by `(provider, tx_ref)` with `FOR UPDATE`. Not found: set outcome `unknown_reference`, respond 200.
6. For success events, call `provider.verifyTransaction(txRef)`. Require status `success`, and amount and
   currency equal to the stored payment row. Otherwise set outcome `mismatch`, do NOT mark anything paid, respond 200.
7. Lock the invoice `FOR UPDATE`.
   - `sent`: mark payment `succeeded` (`confirmed_at`), invoice `paid` (`paid_at`), outcome `processed`.
   - `paid`: outcome `duplicate_payment` (flag for review; the unique index is the backstop).
   - `void` or `draft`: outcome `paid_on_unpayable_invoice` (flag for review).
8. Failure or cancel events: mark the payment `failed` or `cancelled`; the invoice stays `sent`.
9. Set `processed_at` and commit. Respond 200. Transient errors (database down): roll back and respond 500
   so the provider retries.
10. Logs must never contain secrets, full payloads with personal data, or signatures.

### Chapa provider (test mode first)
- Official docs: https://developer.chapa.co. Antigravity must read the current docs before coding.
  **Do not guess or hardcode endpoint paths, field names, header names, or event-type strings.**
  If the docs are inaccessible, stop and ask the owner to paste the relevant pages.
- Confirmed facts (verified 2026-10-25 from developer.chapa.co):
  - Initialize: `POST https://api.chapa.co/v1/transaction/initialize`. Required body fields: `amount`
    (decimal string), `currency` (ETB|USD), `email`, `tx_ref`. Optional: `first_name`, `last_name`,
    `phone_number`, `return_url`, `customization.*`.
  - Verify: `GET https://api.chapa.co/v1/transaction/verify/{tx_ref}`. Auth: `Bearer <CHAPA_SECRET_KEY>`.
    Check both top-level `status === "success"` AND `data.status === "success"` before marking paid.
    Parse `data.amount` as a decimal string using `utils/money.ts`, never `parseFloat`.
  - Webhooks: signed with HMAC-SHA256 over the raw body. Signature header name must be read from the
    current docs (normalise all header keys to lowercase in code). Webhook URL is registered in the
    Chapa dashboard; `callback_url` in the init request is NOT the webhook URL.
  - `payer email` is a **required** field. The server supplies it from the client record or the request body.
  - Test mode is available before the compliance form; a test key cannot verify a live transaction (401).
- `parseEvent` must extract only our `tx_ref` reference from the payload. Do not hardcode Chapa field
  or event names as string literals; derive them from the docs and note them in `CHAPA_NOTES.md`.
  `verifyTransaction` takes amount and status from the verify response.
- Chapa needs a public URL to deliver webhooks, so real end-to-end testing starts after the first deploy.
  Before that, test the handler with signed fixture payloads.

### Simulated provider (demo mode)
- `createCheckout` returns an internal URL `/pay/simulated/:txRef` (a frontend page styled like a checkout sheet,
  clearly labelled DEMO).
- The page's "Pay (demo)" button calls `POST /demo/simulated/:txRef/complete`. The server builds an event,
  signs it with `SIMULATED_WEBHOOK_SECRET`, and POSTs it to its own `/webhooks/simulated`, so the real
  webhook code path runs.
- Disabled unless `DEMO_MODE=true`.

---

## 10. Security checklist

- [ ] Passwords hashed with bcrypt; never logged or returned.
- [ ] JWT secret from env; 1 hour expiry; role/identity from the token, resources from the database.
- [ ] Every owner endpoint resolves `business_id` from the database; ids from other businesses return 404.
- [ ] Composite foreign keys prevent cross-business references at the database level.
- [ ] Parameterised SQL everywhere; no string-built queries.
- [ ] Zod validation on all inputs; body size limit (e.g. 100 kb); malformed JSON returns 400.
- [ ] Rate limits: login/register, public invoice endpoints, pay endpoint, AI endpoint.
- [ ] CORS allows only `CORS_ORIGIN`; no wildcard in production.
- [ ] Security headers (helmet) on the API; strict headers in `vercel.json`.
- [ ] Public token is long and random; public endpoints return a sanitised object only.
- [ ] Webhook: raw body, timing-safe signature check, idempotency, server-side verification, amount check.
- [ ] No secrets in the repo, logs, screenshots, or the frontend bundle. `.env` is gitignored.
- [ ] Production uses a separate Neon database/branch and a new `JWT_SECRET`.
- [ ] Demo accounts hold fake data only; demo mode is off for any real use.

---

## 11. Testing strategy

Tools: Vitest + Supertest (unit and integration), Playwright (one E2E smoke test only, in `e2e/payFlow.spec.ts`),
a real test database (separate Neon branch or local Postgres).

Must-have tests:
1. **Money:** rounding (half-up) for lines and tax, BigInt overflow case, parsing "100.00", "100.5", "0.01", invalid strings.
2. **Auth:** register creates user + business; duplicate email 409; wrong password generic 401; token required.
3. **Tenant isolation:** business A cannot read, edit, archive, send, void, or download PDFs of business B's
   clients/invoices (expect 404). A client from business B cannot be attached to an invoice of business A (database error mapped to 422/404).
4. **Invoice lifecycle:** illegal transitions rejected; only drafts editable; send needs items and total > 0.
5. **Numbering concurrency:** send 10 drafts concurrently; numbers are unique and consecutive.
6. **Public endpoints:** drafts not visible; sanitised payload has no internal ids or client contact data.
7. **Webhook:** bad signature (401, no writes); valid success marks paid; same event twice (second is a no-op);
   wrong amount (mismatch, not paid); unknown reference; success for an already-paid invoice (flagged);
   success for a void invoice (flagged).
8. **Dashboard:** per-currency sums; overdue boundary on the due date in the business timezone.
9. **Frontend:** component tests for the invoice form totals preview and the status chip; one smoke test of the pay flow in demo mode.
10. **Manual QA script** in the README: register, create client, create and send invoice, open the public link in a private window, pay with Simulated, watch the dashboard update.

---

## 12. UI/UX design (Grey-inspired)

### 12.1 Inspiration and boundaries
The look is inspired by modern consumer finance apps such as Grey: dark, confident hero areas; clean
white surfaces; a single electric-blue accent; bento-style feature grids; pill buttons; multi-currency
balance cards; tidy activity feeds; a bottom navigation bar on mobile.

Boundaries:
- Take the feeling and structure only. Do NOT copy Grey's logo, name, copy, illustrations, icons, or screenshots.
- Use an original wordmark (simple text wordmark plus a small geometric mark) and original copy.
- The hex values below come from a secondhand style summary and are approximations, not measurements of Grey.
- No fake testimonials, no invented user counts, no partner logos.

### 12.2 Design tokens (`styles/tokens.css`)
```css
:root {
  /* neutrals */
  --ink-950: #0B0B0C;      /* dark base: hero, auth side panel */
  --ink-900: #111827;      /* headings */
  --ink-700: #374151;
  --ink-600: #4B5563;      /* body text on tinted surfaces (passes AA on #F4F4F6) */
  --ink-500: #6B7280;      /* secondary text on white */
  --line:    #E5E7EB;
  --surface: #FFFFFF;
  --surface-2: #F4F4F6;

  /* brand and status */
  --blue-600: #1F6FFF;     /* links, focus rings, decorative accents. NOT for button fills (contrast 3.76:1, fails WCAG AA) */
  --blue-700: #1A5FE0;     /* ALL filled blue button backgrounds (contrast 4.67:1, passes WCAG AA on white) */
  --blue-50:  #EAF1FF;
  --green-500: #10B981;  --green-50: #ECFDF5;   /* paid */
  --amber-500: #F59E0B;  --amber-50: #FFFBEB;   /* pending / due soon */
  --red-500:   #EF4444;  --red-50:   #FEF2F2;   /* overdue / failed */

  /* shape and depth */
  --radius-sm: 10px;  --radius-md: 14px;  --radius-lg: 20px;  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06);
  --shadow-float: 0 12px 40px rgba(0,0,0,.25);

  /* motion */
  --ease: cubic-bezier(.2,.8,.2,1);
}
[data-theme="dark"] {
  --ink-900: #F3F4F6;  --ink-700: #D1D5DB;  --ink-600: #9CA3AF;  --ink-500: #9CA3AF;
  --line: #1F2937;  --surface: #0B0B0C;  --surface-2: #111317;
  --blue-50: #0F1B33;  --green-50: #0B2A22;  --amber-50: #2B2108;  --red-50: #2C1111;
}
```
Light is the default for the app; the landing hero and auth side panel are always dark.
The theme choice is stored in `localStorage` and applied before first paint (inline script, no flash).

### 12.3 Typography
- Headings: **Plus Jakarta Sans** 600/700/800. UI and body: **Inter** 400/500/600. `font-display: swap`, subset to Latin only.
- Hero: `clamp(2.5rem, 6vw, 4rem)`, line-height 1.05, letter-spacing -0.02em.
- Section titles: `clamp(1.5rem, 3vw, 2rem)`. Body 16px on marketing, 14 to 15px in the app.
- All money uses `font-variant-numeric: tabular-nums`.

### 12.4 Layout system
- Container max width 1200px; 16px page gutter on mobile, 24 to 32px on desktop.
- Spacing scale 4/8/12/16/24/32/48/72.
- Breakpoints 640 / 768 / 1024 / 1280.
- Desktop app: left sidebar (240px, collapsible) + top header + content. Mobile app: top header + bottom
  navigation (Home, Invoices, [+ New invoice], Clients, Settings) with a raised centre button.

### 12.5 Pages and routes
| Route | Page | Notes |
|---|---|---|
| `/` | Landing | Dark hero, bento features, how it works, "built for correctness" strip, footer |
| `/login`, `/register` | Auth | Split layout: dark panel with floating cards on the left; form on the right (stacked on mobile) |
| `/demo` | Demo redirect | Calls `POST /auth/demo`, stores the returned JWT, and navigates to `/app`. `DEMO_MODE` only; returns 404 in production. |
| `/app` | Dashboard | Greeting, currency balance cards, quick actions, revenue chart, activity feed |
| `/app/invoices` | Invoice list | Status tabs, search, table on desktop / cards on mobile |
| `/app/invoices/new`, `/app/invoices/:id/edit` | Editor | Form + live preview (desktop two columns; mobile single column with sticky total bar) |
| `/app/invoices/:id` | Invoice detail | Status timeline, actions (Send, Copy link, Download PDF, Void), payment info |
| `/app/clients` | Clients | List + side drawer form |
| `/app/settings` | Settings | Business profile, default currency, prefix, timezone, account |
| `/i/:token` | Public invoice | Clean white page, big amount, Pay button |
| `/i/:token/return` | Payment return | "Confirming payment..." polling state |
| `/pay/simulated/:txRef` | Simulated checkout | Demo-only, clearly labelled |
| `*` | 404 | |

### 12.6 Landing page spec
1. **Sticky nav:** wordmark left; links centre (Features, How it works, Under the hood); right: Log in (text) and
   "Create account" (blue pill). Collapses to a menu button on mobile.
2. **Hero (dark, `--ink-950`):** left-aligned headline, sub-text, two CTAs, and a small note
   "Portfolio project. Payments run in test mode."
   - Headline: `Get paid faster. Invoice in seconds, collect in ETB or USD.`
   - Sub: `Create professional invoices, share a secure link, and watch payments confirm themselves.`
   - CTAs: `Create free account` (blue pill, -> `/register`), `View live demo` (outlined pill, -> `/demo`).
     `/demo` calls `POST /auth/demo` (DEMO_MODE only), receives a JWT, and navigates to `/app`.
     If DEMO_MODE is false, the button is hidden entirely (not greyed out).
   - Right side: floating UI cards that gently drift (6 to 8 second ease loops): an invoice card
     (`INV-0007`, amount, "Sent" chip), a "Payment received" notification with a green dot, and a small
     two-currency balance card (ETB and USD). Respect `prefers-reduced-motion` (static).
3. **Bento features (light):** 6 cards on a 12-column grid with varied spans:
   Invoices in seconds; Pay-by-link; Confirmed automatically; ETB and USD side by side; PDF invoices;
   Your data stays yours. Each card: icon in a rounded square, title, one line, optional mini-visual.
4. **How it works:** 3 numbered steps (Create, Share, Get paid) with simple illustrations.
5. **Under the hood (for portfolio readers):** one wide dark card listing: money stored as integers, webhooks
   verified and de-duplicated, one business can never see another's data, tested end to end. Link to the GitHub repo.
6. **Footer:** short link columns (Product, Demo, GitHub, README) and a "portfolio project, test mode" note.

### 12.7 App dashboard spec
- **Header:** `Good morning, {name}`, avatar, notification bell (can be a placeholder with no backend), theme toggle.
- **Currency cards (carousel on mobile, row on desktop):** one card per currency in use (ETB, USD).
  Big number = Outstanding. Under it two small stats: Overdue (red) and Paid this month (green).
  Count-up animation under 600ms on first load. Never add ETB and USD together.
- **Quick actions:** round icon buttons labelled New invoice, Add client, Share link (last sent), Invoices.
- **Revenue chart:** 6-month bars, currency toggle (pill tabs), lazy-loaded.
- **Recent activity:** list rows with a status dot, text (`INV-0004 paid by Hana`), relative time, amount on the right.
  Status is always dot + text, never colour alone.
- **Empty state (new account):** friendly card "Create your first client", then "Create your first invoice".

### 12.8 Component inventory
Button (primary blue pill, secondary outlined, ghost, danger; sizes sm/md/lg; loading state), Input, Select,
Textarea, MoneyInput, DateInput, Card, StatCard, CurrencyCard, StatusChip (draft/sent/paid/overdue/void),
Table, MobileCard, Tabs/PillTabs, Drawer, Modal (focus trap), Toast (aria-live), Skeleton, EmptyState,
Avatar, Tooltip, Logo, Theme toggle, ConfirmDialog, CopyButton (with aria-live feedback).

Status chips: Draft (neutral), Sent (blue), Paid (green), Overdue (red), Void (neutral struck-through).
Every chip has a dot AND text.

### 12.9 States and feedback
- Loading: skeleton shimmer shaped like the final content (no spinners for page loads).
- Empty: icon, one line of explanation, one primary action.
- Error: inline alert with a retry button; forms show field-level messages.
- Success: toast; destructive actions need a confirm dialog (Void, Delete draft, Archive client).
- Slow backend (free tier cold start): after 4 seconds of waiting show
  "Waking up the server, this can take up to 30 seconds."

### 12.10 Motion rules
- Durations 150 to 250ms for UI, up to 600ms for count-ups, 6 to 8s for ambient float loops.
- Page content fades in over 150ms. No parallax beyond the hero floating cards.
- Everything respects `prefers-reduced-motion` (static values, instant transitions).
- Heavy pieces (chart, landing animations) are lazy-loaded.

### 12.11 Accessibility and performance targets
- WCAG AA contrast for all text (check blue on white, grey text on tinted surfaces).
- Visible focus ring (2px blue with 2px offset); full keyboard navigation; 44px minimum touch targets.
- Semantic landmarks, one `h1` per page, labelled inputs, `aria-live` for toasts and payment status.
- Lighthouse (mobile) targets: Performance 90+, Accessibility 95+, Best Practices 100, SEO 100 on public pages.
- Meta tags and Open Graph image (1200x630) for the landing page and public invoice page (generic title, no private data).

### 12.12 Public invoice page
Centred card on `--surface-2` background. Top: business name and "Invoice INV-0007". Large amount due,
status chip, due date. Items table (stacked on mobile), subtotal, tax, total. Blue pill **Pay now**
(disabled with explanation if paid or void), secondary **Download PDF**. A paid invoice shows a green
"Paid on {date}" banner and hides the Pay button. Footer: "Invoice created with APP_NAME".

---

## 13. Deployment and operations

- **Neon:** a separate production database or branch. Run migrations from your machine with the
  production `DATABASE_URL` set only for that terminal session.
- **Render (API):** `render.yaml` blueprint; health check on `/health`; environment variables set in the dashboard.
  If the build fails with `tsc: not found`, install dev dependencies in the build command
  (`npm install --include=dev && npm run build`).
- **Vercel (web):** root directory `frontend`; `VITE_API_URL` set to `https://<service>.onrender.com/api/v1`;
  `vercel.json` contains the SPA rewrite so deep links do not 404. `VITE_` variables are baked in at build time,
  so redeploy after changing them.
- **CORS:** set `CORS_ORIGIN` to the exact Vercel origin after the first frontend deploy.
- **Chapa:** after deploy, register the webhook URL (`API_BASE_URL/webhooks/chapa`) in the Chapa dashboard and
  copy the webhook secret into the API environment.
- **Demo data:** `seedDemo.ts` creates a demo owner with a business, 5 clients, and about 15 invoices across ETB and USD
  (draft, sent, overdue, paid, void) so the dashboard looks real. Demo logins go in the README only.
- **Cold starts:** the free API tier sleeps. Real provider webhooks could be missed while it sleeps, so the README
  states that the live demo uses the Simulated provider and that production would use an always-on instance.

---

## 14. README outline and "hardest problems"

README sections: what it is, live demo, demo logins, screenshots, features, architecture diagram,
data model, how payments work, security notes, test mode disclosure, run locally, run tests, deployment, roadmap.

Hardest problems (use these in proposals, only once they are true):
1. Webhook verification and idempotency: signed raw body, duplicates ignored, server-side verification, amount check.
2. Money as integers with a defined rounding rule, including BigInt for large intermediates.
3. Gapless invoice numbers under concurrent requests.
4. Tenant isolation enforced by queries AND composite foreign keys.
5. A provider interface so Chapa, a simulator, or Stripe can be swapped without touching invoice code.
6. A polished, accessible interface (Lighthouse 90+/95+).

---

## 15. Assumptions to verify

- [x] Chapa endpoint names, request fields, webhook headers, event names, payer-email requirement — **RESOLVED** (verified 2026-10-25).
      `email` is required. Endpoint and field details are in §9 Chapa notes. Hardcoding field names is forbidden.
- [ ] How Chapa test mode behaves for a free sandbox account created from Ethiopia (verify in dashboard after first deploy).
- [x] Ethiopic font in PDFs — **RESOLVED**: Embed **Noto Sans Ethiopic** in the backend bundle (Prompt 10).
      Verify the font licence (SIL Open Font Licence 1.1 — confirm before embedding). ~500 KB added to the Render deploy.
      Latin characters render correctly with Noto Sans Ethiopic. Without it, Amharic names appear as □ in PDFs.
- [x] Contrast of white on `--blue-600` — **RESOLVED**: 3.76:1, fails WCAG AA. Button fills use `--blue-700` (#1A5FE0, 4.67:1).
- [ ] Neon free-tier limits for connections and storage.
- [ ] Stripe: not available for Ethiopian accounts. A Stripe provider is a possible future adapter if an account becomes available.
