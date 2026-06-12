-- 149_auth_hook_yuno_domain.sql
--
-- Auth Hook: before-user-created
-- Rechaza signups con email fuera de @y.uno y @yuno.co.
-- Solo aplica a NUEVOS users; cuentas legacy quedan intactas porque el
-- hook corre en INSERT-before-commit, no en login de cuentas existentes.
--
-- Activar en Dashboard: Authentication → Hooks → Before User Created →
--   seleccionar public.hook_restrict_yuno_domain → Save.

create or replace function public.hook_restrict_yuno_domain(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_addr text := lower(event->'user'->>'email');
  domain     text := split_part(email_addr, '@', 2);
begin
  if domain in ('y.uno', 'yuno.co') then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message',   'Access restricted to @y.uno and @yuno.co Google Workspace accounts.'
    )
  );
end;
$$;

grant execute on function public.hook_restrict_yuno_domain(jsonb)
  to supabase_auth_admin;

revoke execute on function public.hook_restrict_yuno_domain(jsonb)
  from authenticated, anon, public;

comment on function public.hook_restrict_yuno_domain(jsonb) is
  'Auth hook (before-user-created): rejects new signups whose email is not @y.uno or @yuno.co.';
