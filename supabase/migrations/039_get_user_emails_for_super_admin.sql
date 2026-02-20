-- Function to get user emails from auth.users, restricted to super admins only.
-- Used in the Super Admin org detail dialog to show member emails instead of UUIDs.

CREATE OR REPLACE FUNCTION public.get_user_emails(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.id = ANY(p_user_ids)
    AND public.is_super_admin();
$$;

GRANT EXECUTE ON FUNCTION public.get_user_emails(uuid[]) TO authenticated;
