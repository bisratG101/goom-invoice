-- 001_initial.sql
-- Initial schema for Goom Invoice matching design.md Section 6 exactly.

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

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
