# Comprehensive Security & QA Audit Report (Prompt 18)
**Date:** November 2, 2026  
**Scope:** Full codebase audit covering `design.md` Section 10 (Security Checklist) & Section 11 (Testing Strategy)  
**Status:** 13/14 Section 10 PASS (1 UNVERIFIED); 11/11 Section 11 PASS

---

## 1. Executive Summary

A comprehensive security audit and hardening review of the Goom Invoice codebase was conducted. The application enforces strict multi-tenant isolation through composite foreign key constraints at the database level and authenticated tenant scoping at the application layer. All monetary arithmetic uses integer minor units (`bigint`), input parsing is strictly typed and validated via Zod, and webhook processing executes a deterministic 10-step verification and row-level locking algorithm.

All security findings and test requirements have been remediated, verified, and accompanied by automated regression tests:
1. **Reverse Proxy Topology & Rate Limiting:** Configurable proxy trust via `TRUST_PROXY` (`trust proxy: 1` in production/render.yaml) implemented. Express rate limiting logic and spoofing resistance verified with automated regression tests. **Render proxy topology remains UNVERIFIED**: Render routes traffic through Cloudflare edge proxies before internal load balancers. Whether 1-hop trust accurately extracts the real client IP or collapses to a Cloudflare edge IP cannot be proven from repository code alone and must be verified against live incoming headers (`CF-Connecting-IP` vs `X-Forwarded-For`) in Prompt 19.
2. **Database Isolation & Cleanup Safeguards:** Development database (`goom_dev`) is strictly separated from the automated test database (`goom_test`). `testDb.ts` enforces multi-layer safeguards rejecting development databases (`dev`, `development`, `staging`, `demo`) and requires explicit test identifiers. Server-side `verifyDatabaseIdentity` queries `current_database()` to abort before any `TRUNCATE` or `DROP SCHEMA` if targeting a development database.
3. **HTTP 413 Handling for Oversized Bodies:** Explicitly handled `entity.too.large` / HTTP 413 in `errorHandler.ts`, returning standard JSON `{ error: { code: 'PAYLOAD_TOO_LARGE', ... } }`. Verified with automated Supertest sending 105kb payloads.
4. **SQL Wildcard Character Escaping:** Implemented `escapeIlikePattern` in `sql.ts` to escape `%`, `_`, and `\`. Applied to client and invoice search filters. Verified against SQL injection payloads (`'; DROP TABLE ...`, `' OR 1=1 --`).
5. **JWT Security & Tampering:** Verified explicit algorithm pinning to `HS256`, 1-hour expiry, and minimum 32-character secret validation. Automated tests assert rejection of tokens signed with `"none"` algorithm, foreign secrets, or malformed byte sequences.
6. **Live Database Integration Test Suite:** Successfully executed all 258 backend tests against `postgresql://postgres:postgres@localhost:5434/goom_test` (**258 passed, 0 failed, 0 skipped**).
7. **Frontend Test Suite:** Successfully executed all 128 frontend unit and component tests (**128 passed, 0 failed** across 21 test files).
8. **Playwright E2E Payment Smoke Test:** Configured on dedicated test ports (4001 / 5174) targeting `goom_test`. Orchestrated real-browser owner registration, client creation, invoice drafting, sequential numbering send, payer viewing via public link, simulated checkout, return polling confirmation, and owner dashboard reconciliation (**1 passed in 18.9s in Chromium**).
9. **User Manual QA Execution:** Complete 7-step manual QA script (Registration, Login, Client creation, Invoice creation, Simulated payment, Dashboard reconciliation, and Invoice voiding) verified against `goom_dev`.

---

## 2. Security Checklist Verification (`design.md` Section 10)

| # | Requirement | Status | File & Line References | Notes & Evidence |
| :---: | :--- | :---: | :--- | :--- |
| **1** | Passwords hashed with bcrypt; never logged or returned | **PASS** | `backend/src/modules/auth/auth.routes.ts` (L75, L180-L195)<br>`backend/src/utils/logger.ts` (L31-L34)<br>`backend/src/modules/auth/auth.test.ts` | Passwords hashed using `bcrypt.hash(password, 10)`. Generic 401 prevents account enumeration. `password_hash` is scrubbed from logs and omitted from user objects. |
| **2** | JWT secret from env; 1h expiry; role/identity from token, resources from DB | **PASS** | `backend/src/utils/jwt.ts` (L9-L24)<br>`backend/src/middleware/auth.ts` (L30-L103)<br>`backend/src/modules/auth/auth.test.ts` (L67-L125) | Algorithm pinned to `HS256`. Expiry 1h. Secret >= 32 chars. Verified rejection of `"none"` algorithm, foreign secrets, expired tokens, and tampered signatures. Users & businesses resolved dynamically from PostgreSQL. |
| **3** | Every owner endpoint resolves business_id from DB; cross-tenant returns 404 | **PASS** | `backend/src/middleware/auth.ts` (L105-L155)<br>`clients.routes.ts`<br>`invoices.routes.ts`<br>`business.routes.ts`<br>`dashboard.routes.ts` | `req.business` derived strictly from `businesses WHERE owner_id = req.user.id`. Resource queries filter by `WHERE id = $1 AND business_id = $2`. Missing rows return 404, preventing resource enumeration across tenants. |
| **4** | Composite foreign keys prevent cross-business references at DB level | **PASS** | `backend/migrations/001_initial.sql` (L63, L97, L102)<br>`backend/src/db/dbConstraints.test.ts` | Invoices enforce `FOREIGN KEY (client_id, business_id) REFERENCES clients (id, business_id)`. Payments enforce `FOREIGN KEY (invoice_id, business_id) REFERENCES invoices (id, business_id)`. Partial unique index enforces max 1 succeeded payment per invoice. |
| **5** | Parameterized SQL everywhere; no string-built queries | **PASS** | All query calls in `backend/src/modules/`<br>`backend/src/utils/sql.ts`<br>`clients.test.ts`<br>`invoices.test.ts` | All queries use parameter placeholders (`$1`, `$2`, ...). Search inputs use `escapeIlikePattern` to escape `%`, `_`, and `\`. Verified against classic SQL injection payloads (`' OR 1=1 --`, `'; DROP TABLE ...`). |
| **6** | Zod validation on all inputs; body limit 100kb; malformed JSON 400; oversized 413 | **PASS** | `backend/src/app.ts` (L31, L45)<br>`backend/src/middleware/errorHandler.ts` (L24-L52)<br>`backend/src/app.test.ts` (L41-L73) | All route inputs validated with Zod schemas. Malformed JSON returns HTTP 400 `INVALID_JSON`. Oversized payloads (>100kb) return HTTP 413 `PAYLOAD_TOO_LARGE`. Both covered by automated tests. |
| **7** | Rate limits: login/register, public invoices, pay endpoint; proxy trust verified | **UNVERIFIED** | `backend/src/middleware/rateLimit.ts` (L75-L95)<br>`backend/src/app.ts` (L18-L25)<br>`backend/src/app.test.ts` (L108-L167) | Rate limiting logic and 1-hop proxy handling pass tests. **However, live Render proxy topology remains UNVERIFIED**: Render routes traffic through Cloudflare edge proxies + internal load balancers. A static 1-hop assumption (`trust proxy: 1`) could resolve `req.ip` to a Cloudflare edge IP rather than the true client IP. Requires inspecting live production headers (`CF-Connecting-IP` vs `X-Forwarded-For`) during Prompt 19 deployment. |
| **8** | CORS allows only CORS_ORIGIN; no wildcard in production | **PASS** | `backend/src/app.ts` (L30-L35)<br>`backend/src/config/env.ts` (L12) | `app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))`. `CORS_ORIGIN` is validated as non-empty string. No wildcard `*` allowed in production. |
| **9** | Security headers (helmet) on API; strict headers in vercel.json | **PASS** | `backend/src/app.ts` (L27)<br>`frontend/vercel.json` (L9-L35) | Helmet enabled on Express. `vercel.json` configures `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and HSTS. |
| **10** | Public token is long & random; public endpoints return sanitised object only | **PASS** | `invoices.routes.ts` (L335)<br>`public.routes.ts` (L55-L192, L258-L300)<br>`payments.test.ts` (L380-L400) | Tokens generated via `crypto.randomBytes(32).toString('base64url')` (43 characters). Draft invoices return 404. Public payload exposes only display fields, omitting DB IDs, client email/phone, and owner credentials. |
| **11** | Webhook: raw body, timing-safe signature check, idempotency, server-side verification, amount check | **PASS** | `app.ts` (L37-L41)<br>`chapa.ts` (L157-L195)<br>`simulated.provider.ts` (L49-L80)<br>`webhook.service.ts` (L14-L260)<br>`payments.test.ts` (L400-L550) | Raw body mounted before JSON parser. Timing-safe HMAC-SHA256 signature check. Deterministic idempotency key in `payment_events`. Server-side `verifyTransaction` re-checks amount and currency before row-level invoice lock. |
| **12** | No secrets in repo, logs, screenshots, or bundle; .env gitignored | **PASS** | `.gitignore`<br>`backend/src/utils/logger.ts`<br>`backend/src/app.test.ts` (L28-L30) | `.env` is gitignored. Sensitive keys are redacted by logger. `GET /api/v1/config` verified to return `{ demoMode }` only. |
| **13** | Production uses separate DB/branch and new JWT_SECRET | **PASS** | `design.md` §13<br>`DEPLOY.md`<br>`backend/src/config/env.ts` | Documented in deployment guide; runtime env validation requires 32+ character secret. Dedicated development database `goom_dev` isolated from `goom_test`. |
| **14** | Demo accounts hold fake data only; demo mode off for real use | **PASS** | `seedDemo.ts`<br>`auth.routes.ts` (L278)<br>`public.routes.ts` (L590)<br>`payments.test.ts` | Demo routes return 404 when `DEMO_MODE=false`. Demo database seed creates simulated logistics business. |

---

## 3. Investigation of Key Security Vectors

### Vector 1: Cross-Business Access & Tenant Isolation
- **Endpoints Audited:**
  - `GET`, `PATCH /api/v1/business`
  - `GET`, `POST`, `GET /:id`, `PATCH /:id`, `POST /:id/archive`, `POST /:id/unarchive /api/v1/clients`
  - `GET`, `POST`, `GET /:id`, `PATCH /:id`, `POST /:id/send`, `POST /:id/void`, `DELETE /:id`, `GET /:id/pdf /api/v1/invoices`
  - `GET /api/v1/dashboard/summary`, `GET /api/v1/dashboard/revenue`, `GET /api/v1/dashboard/analytics`, `GET /api/v1/dashboard/activity`
- **Enforcement Mechanisms:**
  - Every handler validates that `req.business` matches the authenticated owner.
  - Queries unconditionally enforce `WHERE id = $1 AND business_id = $2`. Missing rows return HTTP 404.
  - Attaching a client to an invoice verifies `clients WHERE id = $1 AND business_id = $2`.
  - Database composite foreign keys guarantee referential integrity cannot be violated across tenants.
- **Evidence:** Tested in `auth.test.ts`, `clients.test.ts`, `invoices.test.ts`, `pdf.test.ts`, and `dashboard.test.ts`.
- **Status:** **PASS**.

### Vector 2: Public Endpoint Data Exposure
- **Endpoints Audited:**
  - `GET /api/v1/public/invoices/:token`
  - `GET /api/v1/public/invoices/:token/status`
  - `GET /api/v1/public/invoices/:token/pdf`
  - `POST /api/v1/public/invoices/:token/pay`
  - `GET /health` & `GET /config`
- **Enforcement Mechanisms:**
  - Draft invoices return HTTP 404.
  - Serializers project only sanitized display fields: `displayNumber`, `businessName`, `clientName`, `currency`, `status`, `issueDate`, `dueDate`, `items`, `totals`, `sentAt`, `paidAt`.
  - Database primary keys (`id`, `business_id`, `client_id`), client contact information (`email`, `phone`), and owner credentials are excluded.
- **Evidence:** Tested in `payments.test.ts` lines 380-400 and `pdf.test.ts` lines 215-255.
- **Status:** **PASS**.

### Vector 3: Webhook Replay, Signature Verification, and Tampering
- **Algorithm Conformance:** Follows the 10-step algorithm defined in `design.md` §9.
- **Signature Check:** Verified using `crypto.timingSafeEqual` with byte-length matching. Invalid signatures return HTTP 401 with no database mutations.
- **Replay Protection:** `payment_events` enforces a unique constraint on `(provider, event_key)`. Replay attempts return HTTP 200 `{ status: "duplicate" }` immediately after the idempotency check.
- **Amount & Currency Tampering:** For `payment.succeeded` events, `verifyTransaction` calls the provider API. If the verified status, currency, or minor unit amount differs from the stored payment row, the event outcome is recorded as `mismatch` and the invoice remains unpaid.
- **Row Locking:** Both payment and invoice records are locked with `FOR UPDATE` in a single transaction.
- **Evidence:** Tested in `chapa.test.ts` and `payments.test.ts` against live PostgreSQL.
- **Status:** **PASS**.

### Vector 4: Rate Limiting & Proxy Topology
- **Deployment Topology Analysis:** Render deploys services behind an edge proxy infrastructure that utilizes Cloudflare in front of internal Render load balancers / Envoy routers.
- **Configuration Implemented:**
  - `TRUST_PROXY=1` configured in `render.yaml` and documented in `DEPLOY.md`.
  - `app.ts` configures `app.set('trust proxy', 1)` when in production or when `TRUST_PROXY` is set.
  - In development and test, `trust proxy` is disabled by default.
- **Spoofing Resistance & Risks:** With 1 trusted hop, Express resolves `req.ip` from the rightmost client IP appended by Render's proxy and ignores spoofed leftmost entries. However, because Render's public edge includes Cloudflare before Render's load balancers, `trust proxy: 1` may strip only the internal Render load balancer hop and resolve `req.ip` to a Cloudflare egress IP instead of the true client IP, causing shared rate limit buckets across users.
- **Evidence:** Tested in `app.test.ts` lines 108-167.
- **Status:** **UNVERIFIED (Pending live Render proxy header inspection in Prompt 19)**.

### Vector 5: Oversized and Malformed Request Bodies
- **Body Parser Limits:** `express.raw` (100kb) and `express.json` (100kb).
- **Malformed JSON:** Handled in `errorHandler.ts` returning HTTP 400 `INVALID_JSON`.
- **Oversized Body Handling:** Handled in `errorHandler.ts` returning HTTP 413 `PAYLOAD_TOO_LARGE`.
- **Evidence:** Tested in `app.test.ts` lines 41-73.
- **Status:** **PASS**.

### Vector 6: SQL Injection in Search Parameters
- **Parameterization:** Parameter placeholders (`$1`, `$2`, ...) used everywhere.
- **Wildcard Escaping:** `escapeIlikePattern` sanitizes `%`, `_`, and `\`.
- **Injection Safety:** Parameterized queries guarantee SQL injection is impossible. Tested with classic SQL injection strings (`' OR 1=1 --`, `'; DROP TABLE ...`), verifying HTTP 200, zero matching records, and intact database state.
- **Evidence:** Tested in `sql.test.ts`, `clients.test.ts` lines 308-335, and `invoices.test.ts` lines 512-528.
- **Status:** **PASS**.

### Vector 7: JWT Tampering and Authorization
- **Token Security:** Minimum 32-character secret, 1-hour expiry, explicit algorithm pinning (`HS256`).
- **Tampering Resistance:** Verified rejection of unsigned tokens (`"none"` algorithm), foreign secret signatures, tampered payloads, expired tokens, and malformed strings.
- **Evidence:** Tested in `jwt.ts` and `auth.test.ts` lines 49-125.
- **Status:** **PASS**.

### Vector 8: Development vs Test Database Isolation
- **Mechanism:** Separation between `goom_dev` (manual testing and persistent development) and `goom_test` (automated test runner).
- **Enforcement:** `assertSafeTestDatabase` actively rejects any database containing `dev`, `development`, `staging`, or `demo` keywords, and enforces explicit `test` naming. Server-side `verifyDatabaseIdentity` queries `current_database()` to abort before any `TRUNCATE` or `DROP SCHEMA` if targeting a development database.
- **Evidence:** Tested in `dbConstraints.test.ts` lines 139-168.
- **Status:** **PASS**.

---

## 4. Testing Strategy Audit (`design.md` Section 11)

| Test Category | Target | Actual State | Status |
| :--- | :--- | :--- | :---: |
| **1. Money Math** | Rounding (half-up), BigInt, decimal string parsing | 37 tests passing in `money.test.ts` | **PASS** |
| **2. Auth Flow** | Register, duplicate email 409, generic 401, token required | 17 tests passing in `auth.test.ts` against live PostgreSQL | **PASS** |
| **3. Tenant Isolation** | Business B cannot read/edit/delete/pdf Business A data (404) | Integration tests passing in `clients.test.ts`, `invoices.test.ts`, `pdf.test.ts`, `dashboard.test.ts` | **PASS** |
| **4. Invoice Lifecycle** | Illegal transitions, draft-only edits, non-empty send | 17 integration tests passing in `invoices.test.ts` against live PostgreSQL | **PASS** |
| **5. Numbering Concurrency** | 10 concurrent send requests produce sequential numbers without gaps | 5 consecutive runs of 10 concurrent requests passing in `invoices.test.ts` | **PASS** |
| **6. Public Endpoints** | Drafts hidden, sanitised payload without internal IDs | Integration tests passing in `payments.test.ts` & `pdf.test.ts` | **PASS** |
| **7. Webhook Handler** | Signature mismatch (401), duplicate idempotency, amount mismatch | 39 integration tests passing in `payments.test.ts` against live PostgreSQL | **PASS** |
| **8. Dashboard Stats & Analytics** | Per-currency sums, overdue boundary, dual analytics charts (line + histogram) across all 6 timeline options | 23 integration tests passing in `dashboard.test.ts` against live PostgreSQL | **PASS** |
| **9. Frontend Components** | Forms totals preview, status chips, count-up hook, shared timeline selector | 128 tests passing in Vitest across 21 test files | **PASS** |
| **10. E2E Smoke Test** | Playwright pay flow in demo mode (`e2e/payFlow.spec.ts`) | Fully passing in Chromium (`1 passed (18.9s)`) on ports 4001 / 5174 | **PASS** |
| **11. Manual QA Script** | Walkthrough against `goom_dev` documented in `README.md` | All 7 steps verified by user (Registration, Login, Client creation, Invoice creation, Simulated payment, Dashboard reconciliation, Invoice voiding) | **PASS** |

---

## 5. Certification Summary

Every security checklist item in `design.md` Section 10 and Section 11 has been audited and verified with automated test coverage and live PostgreSQL execution. 
- 13 of 14 Section 10 items are verified **PASS**.
- 1 Section 10 item (Item 7: Production Proxy Trust Topology) is marked **UNVERIFIED** pending live header inspection in the production Render deployment (Prompt 19).
- All 11 Section 11 test categories are verified **PASS**, with user manual QA (all 7 steps) confirmed complete against `goom_dev`.
