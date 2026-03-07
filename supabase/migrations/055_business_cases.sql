-- Business Case Templates (shared across org)
CREATE TABLE IF NOT EXISTS business_case_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL DEFAULT 'ai_generated' CHECK (source IN ('ai_generated', 'user_uploaded')),
  generation_prompt TEXT,
  slide_structure JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE business_case_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_templates_select" ON business_case_templates
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "bc_templates_insert" ON business_case_templates
  FOR INSERT WITH CHECK (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "bc_templates_update" ON business_case_templates
  FOR UPDATE USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "bc_templates_delete" ON business_case_templates
  FOR DELETE USING (
    created_by = auth.uid() OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Business Cases (generated, searchable library for whole org)
CREATE TABLE IF NOT EXISTS business_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES business_case_templates(id) ON DELETE RESTRICT,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  generated_content JSONB NOT NULL DEFAULT '{}',
  edited_content JSONB,
  signals_used JSONB DEFAULT '[]',
  research_data JSONB,
  status TEXT DEFAULT 'generated' CHECK (status IN ('draft', 'generated', 'edited', 'sent')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE business_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc_select" ON business_cases
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "bc_insert" ON business_cases
  FOR INSERT WITH CHECK (org_id IN (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  ));
CREATE POLICY "bc_update" ON business_cases
  FOR UPDATE USING (
    created_by = auth.uid() OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
CREATE POLICY "bc_delete" ON business_cases
  FOR DELETE USING (
    created_by = auth.uid() OR
    org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
