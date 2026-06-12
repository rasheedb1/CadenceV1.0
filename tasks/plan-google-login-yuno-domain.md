# Plan — Login con Google + lock al dominio Yuno

**Fecha:** 2026-05-19
**Owner:** rasheed
**Status:** Pendiente de aprobación

---

## Objetivo

Habilitar **"Sign in with Google"** como único método de login visible en Chief (`chief.yuno.tools`), restringido a cuentas de Google Workspace **`@y.uno` y `@yuno.co`**. Defensa real lado servidor (no solo UX), sin bloquear cuentas legacy.

## Decisiones tomadas

- **D1** — Cuentas legacy (email/password) siguen funcionando vía API. El Auth Hook solo bloquea **nuevos** signups fuera del dominio Yuno.
- **D2** — La UI de `/auth` queda **solo Google**. Removemos los tabs Sign In/Sign Up con password de la pantalla. El endpoint `signInWithPassword` queda habilitado en backend como vía de rescate emergencias (no expuesto en UI).
- **D3** — Crear un **OAuth Client ID NUEVO** en Google Cloud, separado del Client existente para integraciones AE (Calendar/Gmail/Drive). Login solo pide `openid email profile`; integraciones siguen pidiendo los 9 scopes pesados.
- **D4** — Usar **`before-user-created` Auth Hook** (GA) en vez de trigger `auth.users`. El hook rechaza antes del insert; el trigger lo permitiría y luego haría rollback con identities huérfanas.
- **D5** — `hd` parameter va a `*` (NO `y.uno`). Razón: `hd` solo acepta 1 dominio o `*`, y necesitamos permitir tanto `@y.uno` como `@yuno.co`. El filtrado real lo hace el hook.

---

## Fase 1 — Google Cloud Console (5 min)

- [ ] 1.1 Abrir GCP del proyecto que aloja el OAuth Client existente (`chief-integrations` o equivalente). Confirmar que es el project bajo `yuno-payments` org.
- [ ] 1.2 APIs & Services → Credentials → **Create Credentials → OAuth Client ID → Web application**.
- [ ] 1.3 Name: `chief-login` (separado de `chief-integrations`).
- [ ] 1.4 Authorized JavaScript origins:
  - `https://chief.yuno.tools`
  - `http://localhost:5173` (dev)
- [ ] 1.5 Authorized redirect URIs (**literal, sin trailing slash**):
  - `https://arupeqczrxmfkcbjwyad.supabase.co/auth/v1/callback`
  - `http://127.0.0.1:54321/auth/v1/callback` (Supabase local)
- [ ] 1.6 Save → copiar **Client ID** y **Client Secret** (necesarios en Fase 2).
- [ ] 1.7 Confirmar en **OAuth consent screen** que el app está como "Internal" (Workspace only) bajo `yuno-payments` — esto refuerza el lock a nivel Google.

## Fase 2 — Supabase Auth provider config (3 min)

- [ ] 2.1 Supabase Dashboard → project `arupeqczrxmfkcbjwyad` → **Authentication → Providers → Google**.
- [ ] 2.2 Toggle ON, pegar Client ID + Secret de Fase 1.7. Save.
- [ ] 2.3 **Authentication → URL Configuration**:
  - Site URL: `https://chief.yuno.tools`
  - Additional Redirect URLs (one per line):
    - `https://chief.yuno.tools/auth/callback`
    - `http://localhost:5173/auth/callback`
- [ ] 2.4 No tocar nada más (PKCE viene por default en `@supabase/supabase-js` v2).

## Fase 3 — Migration: Auth Hook con dominio allowlist

- [ ] 3.1 Crear archivo `supabase/migrations/NNN_auth_hook_yuno_domain.sql` con:

```sql
-- Hook: before-user-created
-- Rechaza signups fuera del dominio Yuno. Cuentas legacy (creadas antes
-- de activar el hook) NO se ven afectadas — el hook solo corre en INSERT.

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
  'Auth hook: rejects new user creation if email is not @y.uno or @yuno.co';
```

- [ ] 3.2 Aplicar la migration vía **Supabase Management API** (NO git push — ya quemamos esa lección con mig 147):
  ```bash
  curl -sS -X POST \
    -H "Authorization: Bearer $SUPABASE_MANAGEMENT_PAT" \
    -H "Content-Type: application/json" \
    -d "$(jq -Rs '{query: .}' < supabase/migrations/NNN_auth_hook_yuno_domain.sql)" \
    "https://api.supabase.com/v1/projects/arupeqczrxmfkcbjwyad/database/query"
  ```
- [ ] 3.3 Verificar que la función existe:
  ```sql
  select proname from pg_proc where proname = 'hook_restrict_yuno_domain';
  ```
- [ ] 3.4 **Activar el hook** en Dashboard → **Authentication → Hooks → Before User Created** → Enable → seleccionar `public.hook_restrict_yuno_domain` → Save.

## Fase 4 — Frontend: AuthContext + Auth.tsx + /auth/callback

- [ ] 4.1 Crear método en [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx):
  ```ts
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: '*',                  // permite cualquier Workspace; hook valida y.uno/yuno.co
          prompt: 'select_account', // fuerza picker incluso si ya hay sesión Google activa
        },
        scopes: 'openid email profile',
      },
    });
    if (error) throw error;
  };
  ```
  Exportarlo en el `AuthContext.Provider value`.

- [ ] 4.2 Rewrite [src/pages/Auth.tsx](src/pages/Auth.tsx) — eliminar tabs Sign In/Sign Up + form de password. Layout final:
  - Logo Chief centrado
  - Heading: "Sign in to Chief"
  - Subheading: "Only @y.uno and @yuno.co accounts"
  - Botón: **"Continue with Google"** (con icono Google) → llama `signInWithGoogle()`
  - Estado loading: spinner + disabled hasta redirect
  - Error banner si llega `?error=domain_restricted` en la URL (renderizar mensaje "Sign in failed — your account must be @y.uno or @yuno.co")

- [ ] 4.3 Crear nueva ruta `/auth/callback` en [src/App.tsx](src/App.tsx) que renderice un componente `<AuthCallback />` minimal:
  ```tsx
  // src/pages/AuthCallback.tsx
  export default function AuthCallback() {
    const navigate = useNavigate();
    useEffect(() => {
      (async () => {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          await supabase.auth.signOut();
          const reason = error.message.toLowerCase().includes('restricted')
            ? 'domain_restricted'
            : 'unknown';
          navigate(`/auth?error=${reason}`, { replace: true });
          return;
        }
        navigate('/', { replace: true });
      })();
    }, [navigate]);
    return <FullScreenSpinner label="Signing you in…" />;
  }
  ```

- [ ] 4.4 Verificar que el trigger `handle_new_user()` ([001_initial_schema.sql:525](supabase/migrations/001_initial_schema.sql#L525)) funciona con OAuth users — Google entrega `raw_user_meta_data.full_name`, así que la fila en `profiles` se crea bien.

## Fase 5 — Env vars & deploy

- [ ] 5.1 Actualizar `.env.example` para documentar que no se necesitan nuevas vars de cliente (todo vive en Supabase Auth config).
- [ ] 5.2 NO tocar Railway env (los OAuth Client ID/Secret nuevos viven SOLO en Supabase Auth dashboard).
- [ ] 5.3 Commit + `git push origin main` → Railway auto-deploys `FrontEndChief` (ver [feedback_deploy_railway_only.md](../.claude/projects/-Users-rasheedbayter-Documents-Laiky-AI/memory/feedback_deploy_railway_only.md)).

## Fase 6 — Testing checklist (verificación obligatoria antes de marcar done)

- [ ] 6.1 **Happy path Yuno** — incógnito → `chief.yuno.tools/auth` → click "Continue with Google" → login con `rasheed@y.uno` → redirige a `/auth/callback` → llega a `/` autenticado. Verificar fila nueva en `profiles`.
- [ ] 6.2 **Rejected domain** — incógnito → login con Gmail personal (no Yuno) → debe quedar en `/auth?error=domain_restricted` con mensaje visible. Confirmar que NO se creó fila en `auth.users` (correr `select count(*) from auth.users where email ilike '%gmail.com'` antes y después).
- [ ] 6.3 **Legacy password rescue** — desde DevTools / curl, invocar `supabase.auth.signInWithPassword({ email: 'rasheedbayter@gmail.com', password: '...' })` → confirmar que SÍ entra (cuenta pre-existente).
- [ ] 6.4 **Logout** — botón logout → `supabase.auth.signOut()` → redirige a `/auth`. Verificar que volver a entrar no skipea el picker de Google (gracias a `prompt: 'select_account'`).
- [ ] 6.5 **Re-login mismo usuario** — login → logout → login otra vez → no duplica fila en `profiles` (FK + trigger maneja idempotencia).

## Fase 7 — Capas opcionales de seguridad (decidir post-validación)

- [ ] 7.1 **MFA obligatorio** para roles Admin/Manager — Supabase Auth soporta TOTP nativo. Configurar enforce per-role en RLS.
- [ ] 7.2 **Session timeout** — actualmente refresh token rota cada 1h. Reducir a 30min para sesiones inactivas (config en Supabase Auth → JWT expiry).
- [ ] 7.3 **Audit log** — agregar tabla `auth_events` con trigger en `auth.users` para insert/update/delete → útil si hay incidente de seguridad.

---

## Riesgos / Gotchas (confirmados en research)

1. **Redirect URI literal** — Google rechaza con `redirect_uri_mismatch` si no es exacto, sin trailing slash. Doble-check en Fase 1.5.
2. **`grant execute … to supabase_auth_admin`** — si se olvida, el hook falla con permission denied y Supabase **fail-open** (deja entrar al usuario). Verificar Fase 3.1 letter-perfect.
3. **`hd=y.uno` vs `hd=*`** — si pones `y.uno`, los usuarios `@yuno.co` no aparecen en el picker. Usar `*` (decisión D5).
4. **Hook solo corre en INSERT** — no protege updates de email vía `supabase.auth.updateUser`. Si esto preocupa, agregar trigger DEFENSIVO también en `auth.users` `AFTER UPDATE`.
5. **Migration vía git push NO aplica** — ver [feedback_migrations_apply_separately.md](../.claude/projects/-Users-rasheedbayter-Documents-Laiky-AI/memory/feedback_migrations_apply_separately.md). Aplicar vía Management API en Fase 3.2.
6. **OAuth consent screen "Internal"** — si el GCP project no es bajo Workspace (`yuno-payments`), "Internal" no estará disponible y cualquier Gmail podrá iniciar el flujo (aunque el hook lo rechazará). Confirmar en Fase 1.7.

## Rollback plan

Si algo se rompe en prod:
1. **Dashboard → Authentication → Hooks → disable** "Before User Created" → vuelve a permitir cualquier signup mientras debugeas.
2. **Dashboard → Authentication → Providers → Google → toggle OFF** → quita el botón de login (UI queda con error si nadie tiene password de rescue).
3. **Revertir frontend** — `git revert <commit>` + push → Railway redeploys el Auth.tsx viejo en ~3 min.

---

## Resumen de cambios

| Capa | Archivo / Recurso | Acción |
|------|---|---|
| Google Cloud | OAuth Client `chief-login` | Crear |
| Supabase Dashboard | Auth → Providers → Google | Activar + pegar credenciales |
| Supabase Dashboard | Auth → URL Configuration | Agregar `/auth/callback` |
| Supabase Dashboard | Auth → Hooks → Before User Created | Enable hook |
| DB | `supabase/migrations/NNN_auth_hook_yuno_domain.sql` | Crear + aplicar vía API |
| Frontend | [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx) | Agregar `signInWithGoogle()` |
| Frontend | [src/pages/Auth.tsx](src/pages/Auth.tsx) | Rewrite: solo botón Google |
| Frontend | `src/pages/AuthCallback.tsx` | Crear |
| Frontend | [src/App.tsx](src/App.tsx) | Agregar ruta `/auth/callback` |

**Estimación:** ~90 min de implementación + 30 min de testing. Cero downtime (todo additive).
