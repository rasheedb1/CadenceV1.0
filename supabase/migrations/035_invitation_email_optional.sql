-- Make email optional on invitations — links work without a specific email
-- When someone opens the link and creates an account, their email gets stored on accept

ALTER TABLE public.organization_invitations
  ALTER COLUMN email DROP NOT NULL;

-- Update the RPC function to return invitations even when email is NULL
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  email TEXT,
  role TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  org_name TEXT
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.id,
    i.org_id,
    i.email,
    i.role,
    i.status,
    i.expires_at,
    o.name AS org_name
  FROM organization_invitations i
  JOIN organizations o ON o.id = i.org_id
  WHERE i.token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;
