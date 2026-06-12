-- 151_yuno_domain_auto_join.sql
--
-- Cuando un user nuevo (@y.uno o @yuno.co) hace signup vía Google login,
-- auto-añadirlo como `member` a la org canónica de Yuno (553315b5)
-- y setear su profile.current_org_id, para que entre directo sin pasar
-- por OrgSelect/Onboarding.
--
-- También limpia la org duplicada e8f9cf89 ("Yuno" con 1 admin alejandro
-- y casi sin data) y renombra 553315b5 ("rasheedbayter's Team", la real
-- con 9 agents/16 cadences/103 leads) a "Yuno" con slug 'yuno'.
--
-- IMPORTANTE: este trigger corre AFTER INSERT en auth.users. El hook
-- `before-user-created` (mig 149) ya validó el dominio antes, así que
-- el chequeo aquí es defense-in-depth para usuarios creados por
-- otros caminos (Admin API, signup directo, etc.).

BEGIN;

-- Step 1: borrar la org duplicada (CASCADE limpia 1 cadence + 1 member +
-- cualquier otra row asociada; profiles.current_org_id queda SET NULL
-- gracias al FK behavior).
DELETE FROM public.organizations
WHERE id = 'e8f9cf89-2d4c-4671-85d2-35be4f305fef';

-- Step 2: renombrar la org real a "Yuno" con slug limpio.
UPDATE public.organizations
SET name = 'Yuno',
    slug = 'yuno',
    updated_at = now()
WHERE id = '553315b5-42d0-4518-a461-e4cb12914c54';

-- Step 3: backfill — agregar alejandro@y.uno como 'member' a la org real
-- (no pierde acceso a Chief porque su org vieja se borró arriba).
INSERT INTO public.organization_members (org_id, user_id, role)
VALUES (
  '553315b5-42d0-4518-a461-e4cb12914c54',
  'd2831ceb-ea71-4760-9dcb-7f2cfc2cbdcd',
  'member'
)
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Step 4: setear current_org_id de alejandro a la org Yuno para que su
-- próximo login lo mande directo ahí (sin OrgSelect).
UPDATE public.profiles
SET current_org_id = '553315b5-42d0-4518-a461-e4cb12914c54'
WHERE user_id = 'd2831ceb-ea71-4760-9dcb-7f2cfc2cbdcd';

-- Step 5: reemplazar el trigger handle_new_user para auto-join de
-- nuevos usuarios cuyo email termine en @y.uno o @yuno.co.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  yuno_org_id constant uuid := '553315b5-42d0-4518-a461-e4cb12914c54';
  email_domain text := split_part(lower(coalesce(NEW.email, '')), '@', 2);
  user_full_name text := coalesce(NEW.raw_user_meta_data->>'full_name', '');
  is_yuno boolean := email_domain IN ('y.uno', 'yuno.co');
BEGIN
  INSERT INTO public.profiles (user_id, full_name, onboarding_completed, current_org_id)
  VALUES (
    NEW.id,
    user_full_name,
    FALSE,
    CASE WHEN is_yuno THEN yuno_org_id ELSE NULL END
  );

  IF is_yuno THEN
    INSERT INTO public.organization_members (org_id, user_id, role)
    VALUES (yuno_org_id, NEW.id, 'member')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
