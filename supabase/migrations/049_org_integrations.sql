-- Per-organization integration API keys
-- Allows each org to configure their own Apollo, Firecrawl, etc. keys
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  apollo_api_key TEXT,
  firecrawl_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);

-- RLS: only org members can read, only admin/manager can write
ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_integrations_select" ON public.org_integrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = org_integrations.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

CREATE POLICY "org_integrations_insert" ON public.org_integrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = org_integrations.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "org_integrations_update" ON public.org_integrations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = org_integrations.org_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role IN ('admin', 'manager')
    )
  );

-- Service role can always access (for edge functions)
CREATE POLICY "org_integrations_service_role" ON public.org_integrations
  FOR ALL USING (
    current_setting('role') = 'service_role'
  );
