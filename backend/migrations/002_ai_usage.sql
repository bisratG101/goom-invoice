-- 002_ai_usage.sql
-- Persistent monthly usage tracking for AI invoice drafting per business.

CREATE TABLE IF NOT EXISTS ai_usage (
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period        text NOT NULL, -- Format: 'YYYY-MM'
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, period)
);

CREATE INDEX IF NOT EXISTS ai_usage_business_period_idx ON ai_usage (business_id, period);
