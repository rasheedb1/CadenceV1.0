-- Function to get user emails for members of an organization.
-- Restricted: caller must be a member of the same org.

CREATE OR REPLACE FUNCTION public.get_org_member_emails(p_org_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email::text
  FROM auth.users au
  INNER JOIN organization_members om ON om.user_id = au.id
  WHERE om.org_id = p_org_id
    -- Caller must be a member of this org
    AND EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = p_org_id AND user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_org_member_emails(uuid) TO authenticated;
