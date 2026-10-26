# Goom Invoice: Antigravity Prompts, Start to Finish

How to use this file:
1. Put `design.md` in the root of the NEW project folder first. Never start without it.
2. Paste the **Header** before every prompt, then the prompt itself.
3. Do ONE prompt at a time. Do not paste the next until the checklist under the current one is done.
4. After each prompt, do the **Review ritual** (10 minutes). That is where you learn the code.
5. Commit after every working prompt. If it breaks, go back to the last commit.
6. Focus sprint rule: one prompt = one sprint. Write the next step in your notes when the timer ends.

---

## Header (paste before EVERY prompt)

```
Read design.md fully before doing anything. design.md is the source of truth.
Do exactly one increment: only what this prompt asks. Do not start anything else, do not refactor
unrelated files, do not add features, libraries, or files that are not needed.
If design.md and this prompt conflict, or something is unclear, STOP and ask me.
Never put secrets in code, logs, or commits. Use .env and keep .env.example up to date (names only).
When finished:
1. Run the tests, the typecheck, the linter, and the build. Paste the real output (do not summarise it as "all passing").
2. List every file you created or changed, and explain each new file in 2 lines: why it exists, and what breaks without it.
3. Tell me anything you were unsure about, anything you skipped, and anything that looks risky.
4. Commit with a clear message.
Then stop and wait for me.
```

---

## Review ritual (after every prompt, 10 minutes)

- [ ] Run the tests and the app yourself. Do not trust the report.
- [ ] Open the 2 or 3 most important new files and read them. Ask Antigravity about anything you cannot explain.
- [ ] Ask: "What are the 3 ways this could fail or be attacked? Show me a test for each."
- [ ] Write 3 lines in `notes.md`: what was built, one thing you learned, one bug and its cause.
- [ ] Commit. Write "next step is ___".

---

## Prompt 0: Inspect and align (no code changes)

```
Inspect this folder. Report: what exists, which tools are installed (Node, npm, git, and any Postgres client),
and whether this is a git repository. Do NOT change any files.
Then read design.md and list: (a) anything ambiguous, (b) anything that conflicts with itself, (c) anything
that depends on an assumption in section 15 that we must verify first, (d) the exact order you would build
things in, based on the prompts in prompts.md.
Do not write code.
```
Done when: you have answered every question it asks and fixed anything it found ambiguous in `design.md`.

---

## Prompt 1: Scaffold backend and frontend

```
Set up the project skeleton exactly as in design.md section 5.
Backend: Node + Express + TypeScript (strict), Zod-validated environment (config/env.ts) that refuses to boot if
variables are missing or malformed, a standard error envelope, a JSON body size limit, helmet, CORS from CORS_ORIGIN,
malformed JSON returns 400 INVALID_JSON, GET /health (also checks the database when DATABASE_URL is set),
GET /config (public, no auth, returns { demoMode: boolean } derived from the DEMO_MODE env var — no other secrets),
Vitest + Supertest with tests for /health, /config, the error envelope, and bad JSON. Scripts: dev, build, start, test, typecheck.
Frontend: Vite + React 19 + TypeScript + Tailwind v4 + React Router + TanStack Query, with only a placeholder home page
and a page that calls the API /health and shows the result. Add the font setup from design.md 12.3 and tokens.css from 12.2.
In tokens.css, after the `:root` block, add a Tailwind v4 `@theme` block that maps every CSS custom property to a Tailwind
theme key (e.g. `--color-blue-700: var(--blue-700)`) so Tailwind utilities resolve to the design tokens. Never use
Tailwind's default colour palette utilities directly; use only the mapped token utilities.
Also: .gitignore (env files, node_modules, dist), .env.example for both apps, README stub, git init, first commit.
No database tables yet, no auth, no UI beyond the placeholder.
```
Done when: `npm test`, `npm run build`, and `npm run dev` work in both apps and the frontend shows the API health.

---

## Prompt 2: Deploy the walking skeleton (do this early)

```
Prepare deployment configuration only, for the skeleton: render.yaml for the API (build and start commands, health check /health,
env var names only), frontend/vercel.json with the SPA rewrite and security headers, and a DEPLOY.md with exact step-by-step
instructions for Neon (production database), Render (API), and Vercel (web), including setting CORS_ORIGIN to the exact Vercel
origin and VITE_API_URL to the Render URL plus /api/v1 with no trailing slash. Include the note that VITE_ variables are baked in
at build time. Do not hardcode URLs. List the bugs I am likely to hit (CORS, env variables, SPA 404 on refresh, tsc not found on
Render, SSL on the database) and how to fix each.
```
Done when (YOU do the clicking): the Vercel page shows "API healthy" from the Render API. Fix the CORS and environment bugs now, while the app is tiny, and write each cause in `notes.md`.

---

## Prompt 3: Database migration, migrator, seed script

```
Create backend/migrations/001_initial.sql from design.md section 6 exactly: all tables, constraints, composite foreign keys, indexes,
and the partial unique index payments_one_success_per_invoice. Build a small transactional migrator (db/migrate.ts) that applies
unapplied .sql files in order, records filename and SHA-256 checksum in schema_migrations, refuses to run if an applied file's
checksum changed, and uses an advisory lock. Use pg with SSL verification for Neon. Add scripts: migrate, and a test-database
helper that resets the schema between tests.
Write database tests that PROVE the rules: a client of business B cannot be attached to an invoice of business A (expect an error);
two invoices cannot share (business_id, number); a second succeeded payment for one invoice is rejected; the same
(provider, event_key) cannot be inserted twice; total_minor must equal subtotal_minor + tax_minor; a non-draft invoice must have a number.
Do not write any API routes yet.
```
Done when: the migration runs on a fresh Neon database and every database rule test passes.

---

## Prompt 4: Auth, business, tenant middleware

```
Implement design.md sections 2, 8 (auth and business), and 10:
- POST /api/v1/auth/register creates the user AND the business AND the invoice_counters row in ONE transaction (bcrypt hash, citext email,
  409 on duplicate email). POST /auth/login with a generic 401 for any failure. GET /auth/me. Rate-limit register and login.
- JWT (HS256, 1 hour) via the Authorization header. requireAuth middleware, then requireOwner which loads req.business from
  WHERE owner_id = req.user.id. The business id must never come from the request.
- GET and PATCH /api/v1/business with Zod validation (name, default_currency, invoice_prefix pattern, timezone validated with Intl).
- Tests: registration transaction rolls back completely if the business insert fails; duplicate email; wrong password; expired and
  tampered tokens; a request that tries to pass another business_id in the body/query is ignored; passwords never appear in responses or logs.
No clients or invoices yet.
```
Done when: all auth tests pass and you can register and log in with curl or Thunder Client.

---

## Prompt 5: Clients

```
Implement the clients API from design.md section 8: list (search by name/email, pagination), create, get, update,
POST /clients/:id/archive (sets archived_at, returns 204), POST /clients/:id/unarchive (clears archived_at, returns 200).
There is no DELETE /clients/:id endpoint.
Every query is scoped by req.business.id; a client id from another business returns 404 (not 403).
Zod validation on all inputs. Tests: full CRUD; search; archived clients are hidden from the default list; unarchive
restores a client; and a cross-business test where business A attempts to read, update, archive, and unarchive business B's
client and always gets 404.
```
Done when: the cross-business tests pass.

---

## Prompt 6: Money utilities and invoice totals

```
Create utils/money.ts per design.md section 7 using BigInt for intermediates: round-half-up line totals from quantity_milli and
unit_price_minor, tax from basis points, subtotal and total, and a parser that converts decimal strings like "100", "100.5", "100.00",
"0.01" to minor units without floating point (reject invalid input, more than 2 decimals, negatives, and scientific notation).
Add a formatter for display in minor units. Write thorough unit tests, including half-cent boundaries, the largest allowed values
(to prove there is no overflow), and invalid strings. No API routes in this prompt.
```
Done when: the money tests pass and you can explain why floats are not used.

---

## Prompt 7: Invoices (CRUD, send, void, numbering)

```
Implement the invoices API from design.md sections 7 and 8: create draft, list (filters incl. overdue, search, pagination),
get (with items and payments), update (drafts only), delete (drafts only), send, void.
- The server computes every amount from items using utils/money.ts. Ignore any totals sent by the client.
- Create/update replaces items inside a transaction. Max 50 items, with the limits from design.md.
- send: in ONE transaction, increment invoice_counters for the business (UPDATE ... RETURNING), set number, status = 'sent', sent_at.
  Reject if there are no items or total is 0.
- void: sent invoices only. public_token is generated (32 random bytes, base64url) at creation.
- Overdue is derived using the business timezone; implement it in the list filter and in the response.
Tests: lifecycle rules (illegal transitions are rejected), draft-only editing, totals match hand-calculated examples, a CONCURRENCY test
that sends 10 drafts at once and checks the numbers are unique and consecutive, tenant isolation (404 across businesses),
and the overdue boundary on the due date.
```
Done when: the concurrency test passes reliably (run it 5 times).

---

## Prompt 8: Payments foundation (interface, simulated provider, public endpoints)

```
Implement design.md section 9 up to, but NOT including, Chapa:
- The PaymentProvider interface and a provider registry from PAYMENT_PROVIDERS.
- The Simulated provider (only when DEMO_MODE=true): createCheckout returns a frontend URL /pay/simulated/:txRef;
  POST /demo/simulated/:txRef/complete makes the server build an event, sign it with SIMULATED_WEBHOOK_SECRET, and POST it to
  its own /webhooks/simulated.
- Public endpoints: GET /public/invoices/:token (sanitised, only sent/paid/void), GET .../status,
  POST .../pay (see design.md §9 for the full body spec: optional provider override validated against
  PAYMENT_PROVIDERS; payer email sourced from client record or request body; amount and currency always
  from the invoice on the server; returns { checkoutUrl } and, in DEMO_MODE, also { demoCheckoutUrl }).
  Rate-limit all three.
- POST /auth/demo (DEMO_MODE=true only, ~20 req/15 min per IP, returns 404 when DEMO_MODE=false): returns a 1-hour JWT for the demo
  account. Used by the /demo frontend route.
- The webhook handler implementing the 10-step algorithm in design.md section 9 EXACTLY, mounted with express.raw BEFORE express.json,
  provider-agnostic, using the provider interface.
Tests: bad signature (401, no database writes); valid success marks the payment succeeded and the invoice paid; the same event twice is a no-op;
wrong amount does not mark paid (outcome mismatch); unknown reference; success for an already-paid invoice is flagged and does not create a
second succeeded payment; success for a void invoice is flagged; drafts are never visible publicly; the sanitised payload contains no internal ids,
no client email or phone.
Payer email privacy tests (use log capture — intercept the logger and assert the captured output):
- payerEmail is never written to any log line during the pay flow.
- The payments table has no payer_email column; confirm via the schema test that inserting one is a database error.
- GET /public/invoices/:token and GET /public/invoices/:token/status never return a field containing the payer email.
```
Done when: you can create an invoice, send it, pay it with the simulator through curl, and see it become paid.

---

## Prompt 9: Chapa provider (docs first)

```
Add the Chapa provider. FIRST read the current official documentation at https://developer.chapa.co (initialize transaction,
verify transaction, webhooks, test mode, supported currencies, test cards and mobile numbers).
**Do not hardcode any Chapa endpoint path, field name, header name, or event-type string as a bare string literal in the code.**
Derive them from the docs; put them in named constants at the top of chapa.ts (e.g. `const CHAPA_INIT_URL = ...`).
If you cannot access the docs, stop and ask me to paste the relevant pages as text.
Summarise what you found in a short CHAPA_NOTES.md (endpoints, required fields, webhook header name(s) and how the signature
is computed, event names, amount format, payer-email requirement).
Then implement:
- `createCheckout`: uses confirmed endpoint and required fields; passes payer email (always present per design.md §9).
- `verifySignature`: timing-safe HMAC-SHA256 over raw body bytes; header name from CHAPA_NOTES.md.
- `parseEvent`: extracts only our `tx_ref` (our reference); `eventKey` is deterministic per event.
- `verifyTransaction`: calls verify endpoint; checks both top-level and `data.status`; parses `data.amount`
  with `utils/money.ts` decimal parser, never `parseFloat`.
Test with signed fixture payloads you generate yourself (valid and tampered signatures, duplicate events, wrong amount,
mismatched currency, test/live key mismatch handling). Do not call the live Chapa API in tests; use a fake HTTP layer.
Never log keys, full payloads, or payer email.
```
Done when: fixture tests pass. Real end-to-end testing with Chapa happens after Prompt 18 (it needs your public API URL).

---

## Prompt 10: PDF and dashboard endpoints

```
Implement: (1) GET /invoices/:id/pdf and GET /public/invoices/:token/pdf using pdfkit (no headless browser): business name, invoice number,
dates, client name, items table, subtotal, tax, total, status, notes. Long descriptions wrap; multiple pages if needed.
Set Content-Type and a safe filename.
**PDF fonts:** use a Latin font (Noto Sans or Inter) as the default. Embed **Noto Sans Ethiopic** as a secondary font
for text runs that contain Ethiopic Unicode characters (detect per-string before rendering). Before embedding, read the
font's own `LICENSE` file and confirm it is SIL OFL 1.1; note the confirmation in a code comment.
Add a test that renders a PDF for an invoice whose client name is `"Abebe Bikila አበበ ቢቂላ"` and asserts: (a) the response
is `application/pdf`, (b) the body starts with `%PDF`.
(2) Dashboard endpoints from design.md section 7 and 8: summary, revenue (months param, default 6), activity.
All figures are per currency (never summed across currencies), computed in SQL, in the business timezone.
Tests: PDF responds with application/pdf and starts with %PDF; owner PDF is tenant-isolated; public PDF only for sent/paid/void;
dashboard figures match a hand-built dataset; the overdue boundary; the month boundary in the business timezone.
```
Done when: the dashboard tests match your hand-calculated numbers.

---

## Prompt 11: Demo seed script

```
Write scripts/seedDemo.ts (refuses to run unless DEMO_MODE=true or an explicit --force flag): create a demo owner with a business, 5 clients,
and about 15 invoices across ETB and USD with a realistic spread (drafts, sent, overdue, paid in the last 6 months, one void), created through the
same service functions the API uses (so numbers and totals are correct). Print the demo login at the end. Make it safe to re-run (it must not duplicate data).
```
Done when: the dashboard endpoints return believable data for the demo account.

---

## Prompt 12: Frontend foundation (design system, Grey-inspired)

```
Build the frontend foundation following design.md section 12 exactly:
- tokens.css and the Tailwind v4 @theme mapping (see design.md §4 CSS layering decision and Prompt 1).
  The theme system: light default, dark toggle via `data-theme="dark"` on `<html>`, persisted in localStorage, applied before first paint with an inline script.
  **Blue button rule:** all filled blue Button variants use `--blue-700` (#1A5FE0) as background. `--blue-600` is only for focus rings, links, and decorative accents. Verify the contrast with a contrast checker and note the ratio in a comment.
- Components from 12.8: Button, Input, Select, Textarea, MoneyInput, Card, StatCard, CurrencyCard, StatusChip (dot + text), Table, MobileCard,
  PillTabs, Drawer, Modal with focus trap, Toast with aria-live, Skeleton, EmptyState, Avatar, Logo (original text wordmark + small geometric mark), CopyButton.
- Layouts: desktop Sidebar + Header, mobile Header + BottomNav with a raised centre "+ New invoice" button, PublicLayout.
- API client (VITE_API_URL, token injection, global 401 handling that logs out), TanStack Query setup, auth context and route guards.
- A temporary /styleguide route showing every component in every state (this is for me to review; remove it before launch).
Do not build real pages yet. Do not copy any brand's logo or copy. Respect prefers-reduced-motion.
```
Done when: `/styleguide` looks consistent in light, dark, and at phone width, and the contrast checks pass.

---

## Prompt 13: Auth pages and app shell

```
Build /login and /register with the split layout from design.md 12.5 (dark panel with floating cards on the left, form on the right, stacked on mobile),
react-hook-form + zod validation with inline field errors, loading and error states, redirect after login, and the authenticated app shell
(sidebar/bottom nav, header with name and theme toggle, logout). Add the cold-start message from design.md 12.9 for slow responses.
Tests for the validation and the redirect behaviour.
```
Done when: you can register, log in, refresh the page and stay logged in, and log out.

---

## Prompt 14: Dashboard, clients, settings pages

```
Build /app (dashboard) per design.md 12.7: greeting, one CurrencyCard per currency in use (outstanding big; overdue and paid this month underneath;
count-up under 600ms), quick actions, lazy-loaded revenue chart with a currency toggle, recent activity feed (dot + text), and the new-account empty states.
Build /app/clients (list, search, drawer form, archive with confirmation) and /app/settings (business profile, default currency, prefix, timezone).
Skeletons for loading, inline retry on errors. Mobile layouts must be checked at 390px wide.
```
Done when: the demo account's dashboard looks like a real product on desktop and phone.

---

## Prompt 15: Invoices pages (list, editor, detail)

```
Build /app/invoices (status tabs including Overdue, search, table on desktop and cards on mobile, empty state), the editor
(/new and /:id/edit: client select with inline "add client", dynamic line items, MoneyInput, tax rate, dates, notes; a live PREVIEW of totals that uses
the shared money utilities for display only, with the server remaining the source of truth), and the detail page (status timeline, Send, Copy link,
optional WhatsApp and Telegram share links built as plain URL intents, Download PDF, Void with confirmation, payments list).
Only drafts are editable in the UI. Show server validation errors next to the right fields. Tests for the totals preview and the status chips.
```
Done when: you can create, send, copy the link, and void invoices from the UI.

---

## Prompt 16: Public invoice and pay flow

```
Build /i/:token (design.md 12.12), /i/:token/return (polls status every 2 seconds for up to 30 seconds with an aria-live message; never marks anything paid itself),
/pay/simulated/:txRef (demo only, clearly labelled DEMO, "Pay (demo)" and "Cancel"), and /demo (calls POST /auth/demo, stores JWT, navigates to /app;
only rendered when GET /api/v1/config returns { demoMode: true }).
**Payer email modal on /i/:token:** when the Pay button is clicked and the active provider is Chapa, and the invoice client has no stored email,
show a small modal collecting payerEmail (required, email format), payerFirstName (optional), payerLastName (optional). These are posted to the pay
endpoint and never stored client-side beyond the request.
**DEMO_MODE:** when the server response includes `demoCheckoutUrl`, show a secondary "Pay (demo)" link below the main Pay button, styled clearly as demo-only.
Handle all states: sent, paid, void, not found, already paid.
Add generic meta tags for the public page (no private data).
**Playwright smoke test** (one test file, `e2e/payFlow.spec.ts`): open /demo → confirm /app loads → navigate to the last sent invoice → copy the public link →
open it in a new page → click Pay (demo) → wait for /i/:token/return to show "Payment confirmed" → assert the status chip is "Paid". All other tests use Vitest.
```
Done when: in a private browser window you can open a link, pay with the simulator, and see the owner dashboard update.

---

## Prompt 17: Landing page (Grey-inspired)

```
Build the landing page at / following design.md 12.6 exactly: sticky nav, dark hero with the headline and sub-text provided, floating UI cards (invoice card,
"Payment received" notification, two-currency balance card) with gentle ambient motion that stops under prefers-reduced-motion, the 6-card bento features grid,
How it works (3 steps), the "Under the hood" strip with the GitHub link placeholder, and the footer with the "portfolio project, test mode" note.
**"View live demo" CTA:** links to `/demo`. The frontend calls `GET /api/v1/config` on load; if `demoMode` is false, hide the button entirely (not disabled, not greyed — absent).
Use only original copy and mini-visuals built with CSS/SVG; no stock photos, no brand logos, no testimonials, no invented numbers.
Lazy-load below-the-fold sections. Add title, description, canonical, Open Graph, Twitter tags, a 1200x630 OG image, and a favicon.
Target Lighthouse mobile: Performance 90+, Accessibility 95+, Best Practices 100, SEO 100. Report the actual Lighthouse numbers.
```
Done when: you run Lighthouse yourself and the numbers are met.

---

## Prompt 18: Hardening, QA, security review

```
Do a security and quality review of the whole project against design.md section 10 and 11. Produce SECURITY_REVIEW.md: for each checklist item, PASS or FAIL
with evidence (file and line, or a test name). Then fix every FAIL in small commits. Specifically try to break: cross-business access on every endpoint,
the public endpoints' data exposure, webhook replay and tampering, rate limits, oversized and malformed bodies, SQL injection attempts in search parameters,
JWT tampering. Add missing tests. Run the full suite, typecheck, lint, and build, and paste the real output.
Also write the manual QA script in README.md (register, create client, create and send an invoice, open the link in a private window, pay with the simulator,
watch the dashboard update, void another invoice).
```
Done when: SECURITY_REVIEW.md has no FAILs and you have run the manual QA script yourself.

---

## Prompt 19: Production deploy and Chapa end-to-end

```
Using DEPLOY.md: help me verify the production environment variables list (names only), run the production migration, seed the demo data, and set DEMO_MODE
appropriately. Then give me a step-by-step Chapa checklist: where to create test keys, where to register the webhook URL (API_BASE_URL/webhooks/chapa),
where the webhook secret goes, how to run one test payment with the test card/number from the Chapa docs, and how to confirm the invoice became paid and
the payment_events row was written. List what to check in the logs, and what each failure outcome means.
```
Done when (YOU do the clicking): one Chapa test payment marks an invoice paid in production, and one simulated payment does too.

---

## Prompt 20: README, screenshots, portfolio package

```
Finish README.md per design.md section 14: what it is, live demo link, demo logins (fake data only), screenshots placeholders (I will add real ones),
features, architecture diagram (Mermaid), data model summary, how payments work (the pay flow and webhook algorithm in plain English), security notes,
the test-mode disclosure, run locally, run tests, deployment, roadmap, and a "Hardest problems" section using only things that are actually true.
Remove the /styleguide route. Make sure no secrets, no .env, and no private data are in the repository history (report how you checked).
```
Done when: a stranger could clone, run, and understand the project from the README alone.

---

## Prompt 21 (STRETCH): "Describe it" invoice drafting

Only after everything above is done and tested.

```
Add POST /api/v1/ai/draft-invoice. Input: a sentence from the owner. The server calls an LLM API (key in env, server side only) asking for STRICT JSON
(client name, items with description/quantity/unit price, currency, due-in-days, tax rate). Validate with Zod; reject anything outside the limits in design.md;
match the client name to existing clients (or propose creating one); create ONLY a draft, never send or charge anything. Rate-limit it per user, cap input length,
and add a monthly request cap via env. Treat the model output as untrusted input. Frontend: a "Describe it" box on the new-invoice page that fills the
editor with the draft for review. Tests with a mocked LLM: valid output, malformed JSON, out-of-range numbers, prompt-injection text inside the sentence,
and cross-business client matching.
```

---

## Utility prompts

**When something breaks**
```
Here is the failing output (paste it, with secrets removed). Do not change anything yet.
1) Explain the most likely cause in plain English. 2) List 3 ways to confirm it. 3) Propose the smallest fix.
Then wait for my approval before changing code.
```

**When you do not understand a file**
```
Explain <file> as if I must teach it to a client tomorrow: what it does, why it exists, what calls it, what breaks if I delete it,
and what the 3 most important lines are. Then ask me 3 questions to check I understood.
```

**Before showing the project to a client**
```
Pretend you are a client's senior engineer reviewing this repository for 30 minutes. List the 10 questions you would ask me about it,
and for each one tell me where in the code the answer is.
```

**Turn it into a service for Upwork (optional)**
```
Write a checklist I can reuse to audit another team's app for the same classes of problems we tested here (tenant isolation, webhook handling,
money handling, public data exposure, rate limiting). Make each item something I can verify in under 10 minutes.
```

---

## Progress checklist

- [ ] 0 Inspect and align
- [ ] 1 Scaffold
- [ ] 2 Deploy the walking skeleton
- [ ] 3 Database
- [ ] 4 Auth and business
- [ ] 5 Clients
- [ ] 6 Money utilities
- [ ] 7 Invoices
- [ ] 8 Payments foundation (simulated)
- [ ] 9 Chapa provider (fixtures)
- [ ] 10 PDF and dashboard endpoints
- [ ] 11 Demo seed
- [ ] 12 Frontend foundation
- [ ] 13 Auth pages and shell
- [ ] 14 Dashboard, clients, settings
- [ ] 15 Invoices pages
- [ ] 16 Public invoice and pay flow
- [ ] 17 Landing page
- [ ] 18 Hardening and security review
- [ ] 19 Production deploy and Chapa end to end
- [ ] 20 README and portfolio package
- [ ] 21 Stretch: AI drafting

Realistic pace at 2 focused hours a day: about 8 to 10 working sessions for prompts 1 to 11, 5 to 6 for prompts 12 to 17,
and 3 to 4 for prompts 18 to 20.
