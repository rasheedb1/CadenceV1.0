-- SECURITY DEFINER function to look up an invitation by token
-- This bypasses RLS so that unauthenticated (or wrong-account) users
-- can still read the invitation when they have the secret token link.

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

-- Allow both anonymous and authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(TEXT) TO anon, authenticated;
