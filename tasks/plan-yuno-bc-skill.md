# Plan — Business Case Platform Feature (`Presentaciones` planet)

## Scope

A full platform feature, not just a skill. Lets anyone in the org create client business case decks via three channels: WhatsApp (Chief), Claude Code (`/yuno-bc`), and the `Presentaciones` planet in the Chief frontend. Decks live as public URLs on `chief.yuno.tools/bc/<slug>`, expire after 90 days, and are regenerable.

## Architecture

```
[WhatsApp / Claude Code / Frontend button]
   ↓
create_business_case tool / skill / button
   ↓ POST /functions/v1/business-case-create  (shared secret X-Agent-Token)
   ↓
Edge function business-case-create:
  1. research_payment_stack via Firecrawl (FIRECRAWL_API_KEY from Supabase secrets)
  2. compute derivatives (client-side deck does the heavy math; server validates)
  3. INSERT into business_cases (defaults jsonb + raw_research jsonb + expires_at = now + 90d)
  4. return { slug, url: "https://chief.yuno.tools/bc/<slug>" }
   ↓
[User opens URL]
   ↓
Vercel rewrite: chief.yuno.tools/bc/<slug>* → supabase/business-case-render
   ↓
Edge function business-case-render:
  1. SELECT from business_cases WHERE slug = :slug AND archived = false
  2. If not found OR expires_at < now → return expired.html
  3. Fetch template.html from chief.yuno.tools/bc-assets/template.html (static on Vercel)
  4. Inject window.BC_DEFAULTS = <defaults jsonb>
  5. Return HTML (the client's browser loads /bc-assets/bc-slides-01.jsx, etc.)
```

Why this split:
- **Static assets** (template.html, *.jsx, *.css) live in `public/bc-assets/` of the frontend → Vercel CDN → fast.
- **Dynamic HTML** (BC_DEFAULTS injection) is server-side per request → edge function.
- **Data** (defaults + research audit trail) in Supabase → versionable, regenerable.
- **Research** (Firecrawl) runs on Supabase edge functions → API key stays server-side.

## Decisions (confirmed)

| # | Decision | Value |
|---|---|---|
| 1 | Deck URL format | `https://chief.yuno.tools/bc/<clientSlug>-<6charHash>` (e.g., `rappi-a8f3c2`) |
| 2 | Expiration | 90 days after creation |
| 3 | Expired behavior | Archived (row kept, `archived=true`), link serves "this deck expired — regenerate?" |
| 4 | Regenerate | Supported — takes existing row's defaults, re-runs research, inserts NEW row (or updates in place + resets expires_at). Design: new row for auditability. |
| 5 | Auth on create | Shared secret header `X-Agent-Token` (rotated via Supabase secrets) |
| 6 | Auth on render | Public — anyone with link can view until expiration |
| 7 | WhatsApp UX | Single message with ALL questions; user replies with all answers; Chief parses |
| 8 | Frontend navigation | New planeta `Presentaciones` in sistema solar |
| 9 | Multi-tenant | Every row has `org_id`; RLS scopes INSERT/UPDATE to user's org; render is public |

## Phases

### Phase 1 — Migration (15 min)
File: `supabase/migrations/09X_business_cases.sql`

```sql
create table if not exists public.business_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  created_by uuid references auth.users(id),
  client_name text not null,
  slug text not null unique,           -- "rappi-a8f3c2"
  defaults jsonb not null,             -- the full BC_DEFAULTS
  raw_research jsonb,                  -- Firecrawl output for audit
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '90 days'),
  archived boolean default false,
  parent_id uuid references business_cases(id)  -- for regenerations
);

create index idx_bc_org on business_cases(org_id, archived, created_at desc);
create index idx_bc_slug on business_cases(slug) where archived = false;
create index idx_bc_expires on business_cases(expires_at) where archived = false;

alter table business_cases enable row level security;

create policy "org members select" on business_cases for select
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));

create policy "org members insert" on business_cases for insert
  with check (org_id in (select org_id from organization_members where user_id = auth.uid()));

create policy "org members update" on business_cases for update
  using (org_id in (select org_id from organization_members where user_id = auth.uid()));
```

### Phase 2 — Static deck assets (10 min)
Move `presentations/bc-deck/{styles.css, styles-bc.css, deck-stage.js, components.jsx, bc-components.jsx, bc-slides-01.jsx, bc-slides-02.jsx}` to `public/bc-assets/` so Vercel serves them as static files at `https://chief.yuno.tools/bc-assets/*`.

Also create `public/bc-assets/template.html` — the master deck HTML with a `<!-- BC_DEFAULTS -->` placeholder where the edge function will inject the JS object.

### Phase 3 — Edge function: `business-case-create` (1 hr)
`supabase/functions/business-case-create/index.ts`

Inputs (POST body):
```json
{
  "clientName": "Rappi",
  "date": "Q3 2026",
  "tpv": 5000000000,
  ...all 30 BC_DEFAULTS fields,
  "regenerateFrom": "<slug>"  // optional: copy from existing BC
}
```

Auth: `X-Agent-Token` header must match `AGENT_TOKEN` env var.

Logic:
1. Validate inputs (same rules as SKILL.md)
2. Call Firecrawl via `_shared/firecrawl.ts` to get `todayProviders` (unless provided explicitly)
3. Generate slug: `slugify(clientName) + '-' + random(6 chars)`; retry on collision
4. Merge research results into defaults
5. INSERT into `business_cases`
6. Return `{ slug, url, expires_at, providers }`

### Phase 4 — Edge function: `business-case-render` (45 min)
`supabase/functions/business-case-render/index.ts`

Route: GET `/?slug=<slug>` (edge functions don't support path params directly; Vercel rewrite handles the URL rewrite)

Logic:
1. SELECT row by slug
2. Check `expires_at > now()` and `archived = false`
3. If invalid → return a small "link expired" HTML with regenerate CTA
4. Fetch template from `https://chief.yuno.tools/bc-assets/template.html`
5. Replace `/*BC_DEFAULTS_PLACEHOLDER*/` with `JSON.stringify(row.defaults)` (safely JS-escaped)
6. Return HTML with `Content-Type: text/html`

### Phase 5 — Vercel rewrite (15 min)
`vercel.json`:
```json
{
  "rewrites": [
    {
      "source": "/bc/:slug",
      "destination": "https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/business-case-render?slug=:slug"
    }
  ]
}
```

### Phase 6 — Chief MCP tool: `create_business_case` (1 hr)
`chief-agents/src/mcp-tools/business-cases.ts`

New tool that Chief can call from WhatsApp:

```typescript
{
  name: 'create_business_case',
  description: 'Generate a Yuno business case deck for a specific client. Returns a public URL to share.',
  inputSchema: {
    clientName: { type: 'string', description: 'Nombre del cliente' },
    // ... all 30 fields with descriptions
  },
  async execute(args) {
    // POST to business-case-create with shared secret
    // Return the URL
  }
}
```

UX flow on WhatsApp:
1. User: "crea business case para rappi, tpv 5B"
2. Chief detects intent, calls tool with partial args
3. Tool missing-fields check: if pricing/rest are missing, return a "gimme these fields" template
4. Chief sends the template as a single WhatsApp message
5. User replies with all fields in one message
6. Chief parses and re-invokes tool with full args
7. Tool POSTs to edge function, gets URL back
8. Chief: "Listo: https://chief.yuno.tools/bc/rappi-a8f3c2 (válido 90 días)"

### Phase 7 — Register capability (15 min)
`chief-agents/src/integration-registry.ts`:

Add `business_cases` capability (if not already there — MEMORY.md mentions it exists under "external"). Map to the new tool.

### Phase 8 — `Presentaciones` planet (1.5 hr)
1. `src/components/solar/SolarNavigation.tsx`: add `{ id: 'presentaciones', label: 'Presentaciones', icon: '📊', href: '/presentaciones', ... }` to PLANETS array
2. `App.tsx`: add route `<Route path="/presentaciones" element={<FeatureRoute flag="section_presentaciones"><Presentaciones /></FeatureRoute>} />`
3. `src/pages/Presentaciones.tsx`: list view (clone structure from BusinessCases.tsx):
   - List of business case cards (client name, created date, expiry, status)
   - Actions per row: "Copiar link", "Regenerar", "Archivar"
   - "Nueva presentación" button → opens modal with the 30-field form (or skip and redirect to Chief)
4. `src/hooks/useBusinessCases.ts`: TanStack Query hook
5. `src/contexts/PresentacionesContext.tsx`: optional, if list state is complex

### Phase 9 — Claude Code skill (20 min)
Update `.claude/skills/yuno-bc/SKILL.md`:
- Remove "generate local HTML" flow
- Replace with "call business-case-create edge function via curl"
- Keep research.py as optional (for local debugging) but primary path is via the API

### Phase 10 — E2E testing (45 min)
1. From Claude Code: `/yuno-bc Rappi` → full flow → open returned URL → verify all 24 slides
2. From WhatsApp: "crea BC para Rappi" → Chief asks fields → reply → get URL
3. From frontend: navigate to Presentaciones planet → "Nueva" → fill form → submit → URL shown in list
4. Regenerate: click "Regenerar" on Rappi card → new row created → new URL → old URL still works until expiration
5. Expiration simulation: manually set `expires_at = now() - 1 day` → open URL → see "expired" page

## Implementation order

Phase 1 (migration) first — everything depends on the table.
Then Phase 2 + 3 + 4 in parallel (assets + 2 edge functions).
Then Phase 5 (routing).
Then Phase 6 + 7 (Chief integration) parallel with Phase 8 (frontend).
Phase 9 + 10 last.

## Commits strategy

Split into small PRs:
- PR1: Migration + static assets
- PR2: Edge function `business-case-create`
- PR3: Edge function `business-case-render` + Vercel rewrite
- PR4: Chief MCP tool + capability registration
- PR5: `Presentaciones` planet + list page + regenerate flow
- PR6: Claude Code skill update + e2e tests

Each PR is independently mergeable and reviewable.

## Review section
*To be filled after implementation.*
