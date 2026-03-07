-- Add PPTX upload support to business_case_templates
ALTER TABLE business_case_templates
  ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'ai_structured'
    CHECK (template_type IN ('ai_structured', 'uploaded_pptx')),
  ADD COLUMN IF NOT EXISTS pptx_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS detected_variables JSONB DEFAULT '[]';

-- Storage bucket for uploaded PPTX templates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bc-templates',
  'bc-templates',
  false,
  20971520,
  ARRAY['application/vnd.openxmlformats-officedocument.presentationml.presentation']
)
ON CONFLICT (id) DO NOTHING;

-- Allow org members to upload, read, and delete their org's templates
CREATE POLICY "bc_templates_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'bc-templates' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "bc_templates_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'bc-templates' AND
    auth.uid() IS NOT NULL
  );

CREATE POLICY "bc_templates_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'bc-templates' AND
    auth.uid() IS NOT NULL
  );
