-- RPC function to upsert a company into the registry as 'prospected'
-- If company already exists as customer/competitor/dnc, only update prospected fields
-- If it doesn't exist or is 'discovered'/'prospected', set to 'prospected'
CREATE OR REPLACE FUNCTION upsert_company_registry_prospected(
  p_owner_id UUID,
  p_company_name TEXT,
  p_company_name_display TEXT,
  p_prospected_at TIMESTAMPTZ,
  p_prospected_via TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO company_registry (
    owner_id, company_name, company_name_display,
    registry_type, source, prospected_at, prospected_via
  )
  VALUES (
    p_owner_id, p_company_name, p_company_name_display,
    'prospected', 'auto_prospected', p_prospected_at, p_prospected_via
  )
  ON CONFLICT (owner_id, company_name) DO UPDATE SET
    prospected_at = EXCLUDED.prospected_at,
    prospected_via = EXCLUDED.prospected_via,
    -- Only change registry_type if it's not an exclusion type
    registry_type = CASE
      WHEN company_registry.registry_type IN ('customer', 'competitor', 'dnc')
      THEN company_registry.registry_type
      ELSE EXCLUDED.registry_type
    END,
    source = CASE
      WHEN company_registry.registry_type IN ('customer', 'competitor', 'dnc')
      THEN company_registry.source
      ELSE EXCLUDED.source
    END,
    updated_at = NOW();
END;
$$;
