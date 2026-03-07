-- ============================================================
-- 058 — Account Executive (AE) section
-- ============================================================
-- Separate from prospecting (account_maps). AEs manage
-- existing customer accounts, track calls/meetings/emails,
-- and get AI-powered action items + follow-up reminders.
-- ============================================================

-- ── Accounts managed by each AE ──────────────────────────────
CREATE TABLE IF NOT EXISTS ae_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id   UUID NOT NULL REFERENCES auth.users(id),
  name            TEXT NOT NULL,
  domain          TEXT,
  industry        TEXT,
  contract_value  NUMERIC,
  currency        TEXT NOT NULL DEFAULT 'USD',
  renewal_date    DATE,
  health_score    INTEGER NOT NULL DEFAULT 70 CHECK (health_score BETWEEN 0 AND 100),
  stage           TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  gong_account_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Activities: calls (Gong), meetings (Calendar), emails (Gmail) ──
CREATE TABLE IF NOT EXISTS ae_activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ae_account_id    UUID REFERENCES ae_accounts(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  type             TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'manual')),
  source           TEXT NOT NULL CHECK (source IN ('gong', 'gmail', 'google_calendar', 'manual')),
  external_id      TEXT,
  title            TEXT NOT NULL,
  summary          TEXT,
  action_items     JSONB NOT NULL DEFAULT '[]',
  occurred_at      TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER,
  participants     JSONB NOT NULL DEFAULT '[]',
  raw_data         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, source, external_id)
);

-- ── Reminders & follow-ups ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ae_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ae_account_id   UUID REFERENCES ae_accounts(id) ON DELETE CASCADE,
  activity_id     UUID REFERENCES ae_activities(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  title           TEXT NOT NULL,
  description     TEXT,
  due_at          TIMESTAMPTZ NOT NULL,
  completed       BOOLEAN NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Integration tokens (Gong API key, Google OAuth) ──────────
CREATE TABLE IF NOT EXISTS ae_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  provider         TEXT NOT NULL CHECK (provider IN ('gong', 'google_calendar')),
  access_token     TEXT,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  config           JSONB NOT NULL DEFAULT '{}',
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, provider)
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ae_accounts_org ON ae_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_ae_accounts_owner ON ae_accounts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ae_activities_org ON ae_activities(org_id);
CREATE INDEX IF NOT EXISTS idx_ae_activities_account ON ae_activities(ae_account_id);
CREATE INDEX IF NOT EXISTS idx_ae_activities_user ON ae_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_ae_activities_occurred ON ae_activities(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ae_reminders_org ON ae_reminders(org_id);
CREATE INDEX IF NOT EXISTS idx_ae_reminders_user ON ae_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_ae_reminders_due ON ae_reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_ae_integrations_user ON ae_integrations(user_id);

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE ae_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ae_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ae_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ae_integrations ENABLE ROW LEVEL SECURITY;

-- AE accounts: visible to all org members
CREATE POLICY "ae_accounts_select" ON ae_accounts FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_accounts_insert" ON ae_accounts FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_accounts_update" ON ae_accounts FOR UPDATE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_accounts_delete" ON ae_accounts FOR DELETE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- AE activities: visible to org members
CREATE POLICY "ae_activities_select" ON ae_activities FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_activities_insert" ON ae_activities FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_activities_update" ON ae_activities FOR UPDATE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_activities_delete" ON ae_activities FOR DELETE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- AE reminders: visible to org members
CREATE POLICY "ae_reminders_select" ON ae_reminders FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_reminders_insert" ON ae_reminders FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_reminders_update" ON ae_reminders FOR UPDATE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "ae_reminders_delete" ON ae_reminders FOR DELETE
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- AE integrations: private per user
CREATE POLICY "ae_integrations_select" ON ae_integrations FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "ae_integrations_insert" ON ae_integrations FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "ae_integrations_update" ON ae_integrations FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "ae_integrations_delete" ON ae_integrations FOR DELETE
  USING (user_id = auth.uid());

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_ae_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ae_accounts_updated_at
  BEFORE UPDATE ON ae_accounts
  FOR EACH ROW EXECUTE FUNCTION update_ae_accounts_updated_at();
