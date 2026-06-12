# Plan v4.2 — Paula SF Pipeline Watcher

> **v4.2 changelog (2026-05-08, post Phase 0 live introspection):**
>
> **Real schema discovered** (replaces all assumptions):
> - Next Step → `NextStep` (standard, length **255**, plain string)
> - Deal Comments → `Deal_Summary__c` (custom, length **255**, plaintextarea) — **NOT** `Deal_Comments__c` as assumed
> - Blocker → `Blocker__c` (custom, length **255**, plaintextarea)
>
> **Major design simplification:** all 3 fields are 255 chars, not 32K as guessed.
> - **No more dated-section append + FIFO** (impossible with 255 chars).
> - **All 3 fields use OVERWRITE semantics**.
> - Hash-based human-edit detection becomes whole-field hash for all 3 (no per-section logic needed).
> - Section-aware hashing (§7.1) and FIFO archival (§8.2-8.3) **REMOVED** as no-ops.
> - Haiku prompt must produce ≤200-char summaries (50-char safety margin) — Twitter-length, not paragraph.
>
> **Token expiry resolved structurally:**
> - Edge fn `supabase/functions/salesforce-keepalive` (deployed) refreshes the SF access_token directly via OAuth (independent of bridge).
> - pg_cron `sf_token_keepalive` (migration 109, deployed) runs 04:00 UTC daily.
> - On refresh failure: marks connection inactive + WhatsApp alert via bridge callback.
> - Means: tokens get exercised every 24h; SF inactivity-based expiry can't bite us.
>
> **Phase 0 simplified:** schema is now persisted in `paula_sf_field_map` row (org_id `553315b5-...`, confirmed_at=NULL). Subsequent runs use this cache. Re-introspection only triggers on `INVALID_FIELD` write errors.

# Plan v4.1 — Paula SF Pipeline Watcher (historical)

**Owner:** Rasheed Bayter (`76403628-d906-45e1-b673-c4231264da5c`)
**Org:** `rasheedbayter's Team` — `553315b5-42d0-4518-a461-e4cb12914c54`
**Agent:** Paula — `2a3fe079-cc50-48e1-9c1d-36c5f9370504`
**Status:** PLAN v4 — closes v3 blockers (SDK plumbing, PII allowlist, section authorship)
**Date:** 2026-05-07

> **Changelog v1→v2:** Architecture flipped to chief-agents. Human-edit guard rewritten (hash-based). Citation verification deterministic. Append/overwrite explicit. Canary phase. Cost math.
>
> **Changelog v2→v3:** Phase 0 rejects richtextarea & uses API-name primary matching. Section-aware hashing. Per-opp cost isolation. Health check checklist. Multi-channel confirmation. Auto-promote. LATAM PII scrub. Field-history survey. Dropped-section archival. Cap raised to $10.
>
> **Changelog v3→v4:**
> - §3.2 typo fix: `extraTypeInfo='richtextarea'` (was `'richtext'`)
> - §3.2: SF Tooling API queries route via new `sf_tooling_query` MCP tool (separate endpoint)
> - §3.2 step 5: HMAC spec for confirmation link
> - §6.2 step 4: source-ID allowlist BEFORE PII scrub (Gong/Gmail IDs preserved for citation cross-check)
> - §7.1: `section_hashes` schema with `authored_by: 'paula'|'human'` + sticky-frozen flag
> - §7.1.5 NEW: first-write seed behavior (pre-existing human content)
> - §7.6: clarify fan-out is **serial under Paula's identity** by design (closes act.ts max-1-task constraint)
> - §7.6: dispatcher uses **synchronous await** between child enqueues for cost-cap-between-opps
> - §11 task 7: `executeWithSDK` extended to accept `{maxTurns?, maxThinkingTokens?}` overrides — concrete code change to `chief-agents/src/sdk-runner.ts:136`
> - §4.3 auto-promote: minimum signal-volume requirement (≥2 of 4 runs `status='updated'` AND ≥1 with non-empty Gong signals)
> - §11 task 13a: stub `tasks/paula-sf-dpa-notes.md` created with checkboxes
> - §11 task 11: restore intervening-edit detection logic specified
> - §14: pending queue drain semantics

---

## 1. Goal & success criteria

Paula reads my open Salesforce Opportunities (`OwnerId = Rasheed`), correlates each with recent Gmail (matched by Account email domain + Account name in subject) and Gong calls (matched by Account name), produces a concise summary in the dominant language of the signals (Spanish default), and **automatically writes** to three SF Opportunity fields (after Phase 0 confirms API names + lengths):

- "Next Step" (likely API: `NextStep` standard, length 255)
- "Deal Comments" (likely API: `Deal_Comments__c`, length TBD by introspection — long text)
- "Blocker" (likely API: `Blocker__c`, length TBD)

Schedule: **every Monday + Friday, 09:00 America/Mexico_City** (MX is UTC-6 fixed, no DST since 2022 — cron `0 15 * * 1,5` UTC).

### 1.1 Success criteria (hard)

| # | Criterion | Measurement |
|---|---|---|
| S1 | 0 manual interventions for 4 consecutive runs (2 weeks) | Audit table + WhatsApp digest |
| S2 | ≥95% of in-scope opps successfully updated each run | `paula_sf_run_audit` agg |
| S3 | **0** human-edit overwrites (ever) | `prev_values.LastModifiedById` = human + diff != 0 → P0 incident |
| S4 | **0** SF writes citing a date that is not in the fetched signals bundle | Citation validator stats |
| S5 | Cost per run ≤ **$10 hard cap** (chief-agents Sonnet orchestrator + Haiku summarizer); cost-watcher trips at $9.50 | `paula_sf_run_audit.cost_usd` sum |
| S6 | WhatsApp digest delivered within 90s of run end | Bridge log + audit `notified_at` |
| S7 | Canary phase: 4 clean runs on Coppel-only (3 opps) before fan-out | manual gate |

### 1.2 Out of scope (v1)

- Multi-AE — architected but disabled (v2)
- Gong webhook event-driven trigger — v2
- Auto-creating SF Tasks/Activities
- LinkedIn / Apollo / Salesforce Notes
- Localising hedge-detection beyond ES + EN

---

## 2. Architecture (revised)

```
┌──────────────────────────────────────────────────────────────────────┐
│  pg_cron job `paula_sf_cron` (Mon+Fri 15:00 UTC = 09:00 MX)          │
│    ↳ INSERT INTO agent_tasks_v2 (agent_id=Paula, type='sf_pipeline', │
│        params={dry_run:false, scope:'rasheed_canary'|'rasheed_all'}) │
└────────────────────┬─────────────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  chief-agents (Railway, Node) — sdk-runner picks up task             │
│  Paula's role-tools allowlist for this task type:                    │
│    sf_query · sf_describe_object · sf_update_opportunity (gated)     │
│    search_emails · read_email · gong_search_calls_by_deal            │
│    gong_get_transcript · gong_get_action_items                       │
│    paula_field_map_get · paula_field_map_set                         │
│    paula_audit_write · paula_digest_send                             │
│  Orchestrator LLM: claude-sonnet-4-6 (existing default)              │
│  Summarizer LLM (per-opp): claude-haiku-4-5-20251001, temperature=0  │
└────────────────────┬─────────────────────────────────────────────────┘
                     ▼
        Phase 0 → Phase 1 → Phase 2 (parallel 3) → Phase 3 (Haiku)
                     │
                     ▼
        Phase 4 (gates) → Phase 5 (write) → Phase 6 (digest)
                     │
                     ▼
        WhatsApp via openclaw bridge (existing)
```

**Why chief-agents and not a Deno edge fn (resolves v1 review blocker #4):**
- All required tools (`sf_query`, `search_emails`, `gong_*`) are MCP tools registered in chief-agents, not in Deno. Re-implementing in Deno = 6+ weeks, duplicate maintenance, fragile.
- Railway has no 400s wall-clock limit (fly.io / Railway containers are long-running).
- Existing Paula identity, integrations, sense/act loop, cost tracking all work out-of-box.
- Trade-off accepted: Sonnet orchestrator costs ~$0.5-2/run instead of "$0.50". Hard cap $5 keeps it honest.

---

## 3. Phase 0 — Schema discovery (hardened)

**Replaces v1's regex-based fuzzy match — that approach mismatched `NextStepDate`, Spanish locale labels, etc.**

### 3.1 Storage

Create a dedicated table (NOT a generic `agent_memory`, which doesn't exist):

```sql
-- migration 108_paula_sf_field_map.sql
CREATE TABLE paula_sf_field_map (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  next_step_api      text NOT NULL,
  next_step_length   int  NOT NULL CHECK (next_step_length BETWEEN 50 AND 131072),
  deal_comments_api  text NOT NULL,
  deal_comments_length int NOT NULL CHECK (deal_comments_length BETWEEN 255 AND 131072),
  blocker_api        text NOT NULL,
  blocker_length     int  NOT NULL CHECK (blocker_length BETWEEN 50 AND 131072),
  paula_sf_user_id   text NOT NULL, -- the user id of the OAuth used by Paula
  discovered_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz, -- WhatsApp confirmation from Rasheed
  api_version        text NOT NULL DEFAULT 'v59.0'
);
```

### 3.2 Discovery flow (first-run + on-INVALID_FIELD-failure)

1. New MCP tool `sf_describe_object(object='Opportunity')` — calls `GET /services/data/v59.0/sobjects/Opportunity/describe`. Returns `[{name, label, type, length, updateable, custom, extraTypeInfo, htmlFormatted}]`.
2. **Locale-safe candidate matching (API-name first, label as tiebreaker):**
   - **`next_step` slot:** EXACTLY `name='NextStep'` AND `type='string'` AND `updateable=true`. Reject anything else.
   - **`deal_comments` slot:**
     - Tier 1: `name='Deal_Comments__c'` (exact match by API name — locale-immune).
     - Tier 2 fallback (only if Tier 1 absent): all fields where `custom=true` AND `type IN ('textarea','string')` AND `updateable=true` AND `htmlFormatted=false` AND `extraTypeInfo IS NULL OR 'plaintextarea'`. From this set, single match where label normalized (lowercased, accent-stripped) ∈ `{'deal comments','comentarios','comentarios del deal','comentarios del negocio','deal_comments'}`. If 0 or >1 → escalate via WhatsApp listing all candidates for Rasheed to pick.
   - **`blocker` slot:** Tier 1 `name='Blocker__c'`; Tier 2 same rules with label set `{'blocker','blockers','bloqueador','impedimento','obstaculo'}`.
3. **Rich-text rejection (v4 typo-fixed):**
   - For `deal_comments` and `blocker` slots: REJECT if `extraTypeInfo='richtextarea'` OR `htmlFormatted=true`. Salesforce normalizes rich-text content (HTML wrapping, `\r\n` conversion, smart quotes, entity encoding) on save → hashes mismatch on every read-back → 100% false-positive freeze.
   - On reject: send WhatsApp asking Rasheed to either (a) change the field to "Long Text Area" (plain), or (b) point Paula to a different plain-text field. Workflow stays in `confirmed_at IS NULL` state.
4. **SF Flows enumeration (NEW v4.1 — per §16 #3):**
   Active Flows that touch the 3 fields would constantly trigger our hash-based freeze gate. Phase 0 surveys them once and captures Rasheed's policy:
   - Tooling API query: `SELECT Id, MasterLabel, Status, ProcessType FROM FlowDefinitionView WHERE Status='Active'` then for each, fetch `FlowVersionView` metadata to detect field references to `NextStep`/`Deal_Comments__c`/`Blocker__c`. (Heuristic — exact field-reference detection is hard via API; conservatively list all active Opportunity Flows for Rasheed to review.)
   - WhatsApp prompt:
     ```
     🤖 Paula — Active Opportunity Flows detected:
     1. "Auto-set Next Step on stage change" (running as: <user>)
     2. "Sync Blocker to JIRA"
     3. "Update Deal Comments on contract signed"
     For each, reply: ✅ friendly / ❌ disable / ⏭️ skip
     ```
   - Stored in `paula_sf_field_map.friendly_flow_user_ids text[]`.
   - **Hash-detection rule:** if hash mismatch detected AND the SF re-fetch shows `LastModifiedById ∈ friendly_flow_user_ids`, treat as benign — Paula's prior write was overwritten by an expected Flow → **re-introspect that section's authorship as `flow_authored`** (new flag value), DO NOT freeze, allow Paula to overwrite next run.
   - Flows marked `disable_for_paula` → Rasheed responsible for asking Yuno SF admin to disable.

5. **Field-History-Tracking survey (uses Tooling API, NEW v4 routing):**
   - Tooling API objects (`FieldDefinition`, `FlowDefinition`) live at `/services/data/v59.0/tooling/query`, NOT the standard data endpoint. The existing `sf_query` MCP tool hits the data endpoint only.
   - **Build new MCP tool `sf_tooling_query(soql)`** that calls `${instance_url}/services/data/v59.0/tooling/query?q=<encoded-soql>`. Same auth/refresh logic as `sf_query`. Added to §11 task 3a.
   - Query: `SELECT QualifiedApiName, IsHistoryTracked FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName='Opportunity' AND QualifiedApiName IN ('NextStep','Deal_Comments__c','Blocker__c')`.
   - Also query `SELECT MasterLabel, ProcessType, Status FROM FlowDefinitionView WHERE Status='Active'` (separately, with `LIKE '%Opportunity%'` filter on metadata if available) and surface any active Flow that touches the 3 fields → warn Rasheed via WhatsApp on first run only.
   - If any of the 3 fields has `IsHistoryTracked=true`: warn in WhatsApp: *"⚠️ Field History tracked on Deal_Comments__c — bi-weekly Paula writes will fill OpportunityFieldHistory. SF caps history at 18mo. OK to proceed?"*. Log warning. Don't block (admin decision).
5. **WhatsApp confirmation gate (multi-channel, signed link — v4 HMAC spec):**
   - First message via Chief bridge to Rasheed's number, listing the 3 confirmed slots + lengths + history-tracking warnings.
   - Retry every 6h within a 24h window if no response.
   - At T+12h, also send email to rasheed@y.uno with same content + a one-click confirmation URL.
   - **Signed link spec:** `https://chief.yuno.tools/paula-sf-confirm?p=<base64url(payload)>&s=<base64url(hmac)>`
     - `payload = {org_id, field_map_id, exp_unix}` JSON, exp = now+24h.
     - `hmac = HMAC-SHA256(secret=PAULA_CONFIRM_HMAC_SECRET, msg=payload_bytes)`.
     - Secret stored as Railway env var on chief-agents AND on bridge service (same value, rotated quarterly).
     - Constant-time compare on bridge side (`crypto.timingSafeEqual`).
     - Single-use: link only works while `confirmed_at IS NULL`; clicking flips it to `now()`.
     - `exp_unix < now()` → bridge rejects with 410 Gone, instructs to wait for next run.
   - At T+24h, abort the run, mark `last_confirmation_attempt_at`, retry full flow on next scheduled run.
   - Confirmation channels (any one suffices): WhatsApp ✅, email link click, dashboard button.
   - Only on `confirmed_at IS NULL`.
6. **Auto-heal:** any future write that returns `INVALID_FIELD` → wipe `confirmed_at`, re-run discovery + re-confirm.

### 3.3 Acceptance
- v59.0 hard-pinned (matching `chief-agents` codebase; we'll bump `_shared/salesforce.ts` from v58 to v59 in this PR for consistency).
- Map row exists + `confirmed_at` not null before any production write.
- Handles ambiguous matches by escalating, never auto-picking.

---

## 4. Phase 1 — Fetch in-scope opportunities

### 4.1 Identify Paula's SF user

**Critical fix from v1 (review blocker #5):** Paula uses Rasheed's OAuth token, so `LastModifiedById` will equal Rasheed's SF user id on Paula writes — making the human-vs-bot guard impossible without another signal.

**Resolution v1 (no separate SF user available — common case):** Use **content-hash audit** as the source of truth for "did Paula last write this", NOT `LastModifiedById`:
- After every Paula write, store `sha256(field_value)` for each field in `paula_sf_run_audit.new_value_hash`.
- Before next write: read current SF value, hash it, compare to last audited hash for that field.
  - Match → "still Paula's content" → safe to overwrite.
  - Mismatch → "human edited since last Paula write" → trigger freeze rule (§6).
- This works regardless of `LastModifiedById`.

**Resolution v2 (recommended, doc'd as upgrade path):** Provision a dedicated SF user `paula.bot@yuno.co` with API-only license + connected app. Then `LastModifiedById` cleanly distinguishes. Tracked as task in §11.

### 4.2 SOQL (parameterized, not hardcoded)

```sql
SELECT Id, Name, StageName, AccountId, Account.Name, Account.Website,
       NextStep, {{deal_comments_api}}, {{blocker_api}},
       CloseDate, Amount, LastModifiedDate, LastModifiedById, OwnerId,
       SystemModstamp
FROM Opportunity
WHERE OwnerId = :paula_sf_user_id
  AND IsClosed = false
  AND StageName NOT IN ('Closed Lost', 'Disqualified')
ORDER BY LastActivityDate DESC NULLS LAST
LIMIT 100
```

- `{{deal_comments_api}}` and `{{blocker_api}}` interpolated from Phase 0 cache.
- `:paula_sf_user_id` is the actual logged-in SF user (from `salesforce_connections.sf_user_id` = `005Hu00000QlMRGIA3`).
- Read `SystemModstamp` too — used for race detection in §6.

### 4.3 Canary scope + auto-promotion (rewritten v3)

Add a `scope` column to `paula_sf_field_map`:
- `scope='rasheed_canary'` → SOQL adds `AND Account.Name IN ('Coppel','Bancoppel')` → max 3 opps.
- `scope='rasheed_all'` → no extra filter.

Default after Phase 0 confirmation: `scope='rasheed_canary'`.

**Auto-promotion (v4 — minimum signal volume requirement):**

A check runs at the END of each scheduled run, after the digest is sent. Auto-promotion to `rasheed_all` requires ALL of:

```sql
-- Run is "passing" if:
--   no failure statuses
--   AND not all opps were noop (otherwise we never exercised the logic)
WITH canary_runs AS (
  SELECT
    workflow_run_id,
    COUNT(*) FILTER (WHERE status='updated') AS updated_count,
    COUNT(*) FILTER (WHERE status LIKE 'failed_%') AS failed_count,
    COUNT(*) FILTER (WHERE status IN ('updated','noop','skipped_human_edit',
                                       'skipped_concurrent_edit','skipped_no_signals',
                                       'skipped_rate_limit')) AS clean_count,
    SUM(COALESCE(signals_summary->>'calls','0')::int) AS total_calls,
    SUM(cost_usd) AS run_cost
  FROM paula_sf_run_audit
  WHERE scope='rasheed_canary'
    AND created_at > now() - interval '21 days'
  GROUP BY workflow_run_id
),
freeze_exercised AS (
  SELECT COUNT(DISTINCT workflow_run_id) AS runs_with_freeze
  FROM paula_sf_run_audit
  WHERE scope='rasheed_canary'
    AND created_at > now() - interval '21 days'
    AND status = 'skipped_human_edit'
)
SELECT
  (SELECT COUNT(*) FROM canary_runs
   WHERE failed_count = 0
     AND updated_count >= 1
     AND total_calls >= 1
     AND run_cost < 10) AS qualifying_runs,
  (SELECT runs_with_freeze FROM freeze_exercised) AS freeze_runs;
```

Promotion gates:
- **Hard:** `qualifying_runs >= 4`. Below this → stay in canary, no prompt.
- **Soft (informational):** `freeze_runs >= 1`. If `freeze_runs = 0` AND `qualifying_runs >= 4`: still send the promotion prompt but include the warning sentence below — this is documented behavior, not a bug.

If `freeze_runs = 0` (Rasheed never edited a Paula write to exercise the protection): WhatsApp note included in the promotion prompt:
*"⚠️ 4 clean runs but freeze gate was never exercised. Suggested: manually edit one of Paula's Deal Comments and re-run before approving promotion. This is a quick way to verify your edits are preserved."*

WhatsApp prompt to Rasheed:
```
🎉 Paula canary: 4 clean runs sobre Coppel/Bancoppel.
¿Promover a todas tus opps abiertas (~30) ?
✅ Promover  ❌ Mantener canary  📊 Ver audit
```

Only on Rasheed's ✅ → `UPDATE paula_sf_field_map SET scope='rasheed_all'`. Default to staying in canary if no answer.

**Manual override:** Rasheed can demote back to canary at any time via `UPDATE` or a dashboard button.

---

## 5. Phase 2 — Gather context per opp (parallelism = 3)

### 5.1 Email signals
1. **Domain resolution:**
   - `Account.Website` → strip protocol/path → use [public-suffix list](https://publicsuffix.org/) registrable domain (NOT naive split). E.g. `https://shop.coppel.com.mx/x` → `coppel.com.mx`. Bundle a small PSL JSON in chief-agents.
   - Fallback: `sf_get_contacts(account_name)` → top contact's email domain.
   - If both unknown → `email_domain_unknown=true`, skip email matching, still process Gong.
2. **Search:**
   - Delta window: from `paula_sf_run_audit.last_signal_seen_at` for this opp (per-opp delta, not global). First time = last 30 days.
   - `search_emails({query: 'from:@<domain> OR to:@<domain> OR subject:"<account_name>" newer_than:<delta>'})`.
   - **Exclude noise:** prepend `-from:noreply@ -from:no-reply@ -from:notifications@ -from:mailer-daemon@ -from:calendar-server@ -from:donotreply@`.
3. Top 5 by date desc → `read_email` → keep `{from,to,subject,date,snippet[:500]}`.

### 5.2 Gong signals
- `gong_search_calls_by_deal({company_name: Account.Name})`, delta window same as emails.
- Top 3 most recent → `gong_get_transcript` (full text) + `gong_get_action_items`.
- **Internal-only filter (v1 review caught this didn't exist as a tool flag):** post-fetch in chief-agents code, drop calls where ALL participants have `@y.uno` or `@yuno.co` domain.

### 5.3 Output bundle (deterministic shape)

```json
{
  "opp_id": "006Ps00000pqGjFIAU",
  "account_name": "Coppel",
  "domain": "coppel.com.mx",
  "current": {
    "next_step": "Reviewing proposal, ...",
    "deal_comments": "They want to use wallets...",
    "blocker": "they want to see if integration..."
  },
  "current_hashes": {"next_step":"sha256:...","deal_comments":"...","blocker":"..."},
  "emails": [
    {"id":"<gmail-id>","date":"2026-05-04","from":"...","subject":"...","snippet":"..."}
  ],
  "calls": [
    {"id":"<gong-id>","date":"2026-05-02","title":"...","transcript_summary":"...(<=2K chars)","action_items":["..."]}
  ],
  "fetch_timestamps": {"sf_phase1":"...","gmail":"...","gong":"..."},
  "lang": "es"
}
```

`current_hashes` enable §6's freeze rule. `lang` is detected from email + call language (heuristic: ratio of Spanish stopwords; default `es` for LATAM accounts).

**Caps:** 5 emails + 3 calls per opp; transcript summary capped at 2K chars before Haiku.

---

## 6. Phase 3 — Haiku summarization (with deterministic citation verification)

### 6.1 Prompt (per opp)

- Model: `claude-haiku-4-5-20251001`
- **`temperature: 0`** (deterministic — fixes v1 review nit)
- Output forced via prompt **JSON schema** with `source_id` per field:

```json
{
  "next_step":     {"text": "...", "language": "es", "sources": [{"type":"call|email","id":"<gong-id|gmail-id>","date":"YYYY-MM-DD"}]},
  "deal_comments": {"text": "...", "language": "es", "sources": [...]},
  "blocker":       {"text": "...", "language": "es", "sources": [...]} | null
}
```

- Hard rules in prompt:
  - "Each `text` MUST be ≤ {field_length - 50} chars"
  - "Every claim must reference a source listed in input. If no signal supports a claim, omit it."
  - "Output null for any slot with insufficient evidence."
  - **"Write in ENGLISH regardless of source language. Translate Spanish/Portuguese transcripts and emails to English."** (Per §16 #4 decision 2026-05-07.)
  - "Be factual. Use phrases like 'agreed', 'committed' only if explicit in source."

### 6.2 Deterministic post-LLM validation (replaces v1 citation theatre)

For each field's output:

1. **JSON schema parse** — fail-closed if invalid; 1 retry with stricter system prompt.
2. **Source ID cross-check (the real anti-hallucination gate):**
   - For every `source.id` in output → MUST appear in input bundle's `emails[].id` or `calls[].id`. Else strip that source AND any sentence that depends only on it.
   - For every `source.date` → MUST match the input record's date (±1 day). Else strip.
   - If after stripping, `text` references "(call YYYY-MM-DD)" inline but no matching source remains → fail-closed for that field.
3. **Length check** — if `len(text) > field_length - 50` → truncate at last `. ` boundary. If still over → fail-closed.
4. **PII scrub (LATAM-aware, source-ID-safe, v4):**

   **Source-ID allowlist (v4 — closes blocker):** before any scrub regex runs, collect the set `S = {bundle.calls[].id, bundle.emails[].id, bundle.opp_id, bundle.account_id}`. Tokenize the text, mark substrings matching any id in `S` as **immutable** (replace with placeholders `__ID0__`, `__ID1__`, …, scrub-protect, then restore after scrub). This prevents PII regex from eating Gong/Gmail/SF IDs that the citation cross-check (§6.2 step 2) needs to resolve.

   **Scrub regex pipeline (applied in order on protected text):**
   - **Internal emails:** `[A-Za-z0-9._-]+@(y\.uno|yuno\.co)` → `[INT_EMAIL]`.
   - **Phone numbers:** `(\+?52\s?)?\(?\d{2,3}\)?[\s\-]?\d{3,4}[\s\-]?\d{4}` (MX) + E.164 generic → `[PHONE]`.
   - **Card numbers:** Luhn-positive 13-19 digit runs → `[CARD]`.
   - **MX RFC:** `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3}` (with adjacent-word-boundary check) → `[RFC]`.
   - **MX CURP:** `[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]{2}` → `[CURP]`.
   - **CLABE:** `\b\d{18}\b` → `[CLABE]`.
   - **CPF (BR):** `\d{3}\.\d{3}\.\d{3}-\d{2}` → `[CPF]`.
   - **Generic numeric account:** `\b\d{10,20}\b` (LAST in the pipeline, after IDs/dates/phones already protected or substituted) → `[ACCT]`.
     - Pre-skip: any token already matching `^\d{8}T\d{6}` (datetime concat) or any ISO date pattern is excluded.
     - Pre-skip: tokens in the `S` allowlist (already protected above).

   **Order matters:** ID-protect → scrub → restore IDs. Documented as a unit-test pipeline in §12.1.

   **Scrub applied at TWO points** with same pipeline: (a) input bundle to Haiku, (b) Haiku output before SF write — defense in depth.

   **Verification:** unit test asserts `scrub("Per call gong:9876543210, RFC ABCD800101XYZ")` preserves `gong:9876543210` (IDs allowlisted) and produces `"Per call gong:9876543210, RFC [RFC]"`.

   All scrubs logged to `paula_sf_run_audit.pii_scrubs jsonb`: `{rfc:N, clabe:N, ...}` for compliance audit.
5. **Forbidden-phrase check** — any of `["I think","podría","might be","perhaps","speculate","quizás","tal vez"]` near the start → demote that field to `null`.

If ≥30% of opps fail steps 1-3 in a single run → **circuit breaker**: halt the rest, mark run `failed_summarization_circuit`, do NOT write any opp, send WhatsApp alert. (Likely indicates Anthropic-side regression or prompt drift.)

### 6.3 Anthropic outage handling
- Per-call timeout: 20s
- Retries: max 2 with exponential backoff (1s, 4s)
- If Anthropic returns 5xx/429 for >50% of opps → abort run, audit `failed_anthropic_outage`, no writes.

---

## 7. Phase 4 — Pre-write gates (revised, blocking-issue fixes)

For each opp in turn, pass through gates in this order. Any gate failure logs to `paula_sf_run_audit` with reason.

### 7.1 Gate 1 — Section-aware hash + freeze with authorship (v4 — closes section-hash second-edit hole)

**Audit `section_hashes` schema (canonical):**
```jsonc
{
  "<YYYY-MM-DD>": {
    "hash": "sha256-canonicalized-content",
    "authored_by": "paula" | "human",
    "first_human_edit_run_id": "<uuid>" | null,  // set once, never overwritten
    "frozen": false | true                        // true ⇒ never touch again
  },
  ...
}
```

**Sticky-frozen invariant:** once a section's `authored_by='human'` (or `frozen=true`), that flag persists across ALL subsequent audit rows for the same opp+field. Reads always pull the **most recent** audit row's section_hashes; merging is forward-only — Paula NEVER reverts a `human`-authored section back to `paula`.

**Per-run section reconciliation:**
1. Read SF current value, parse into sections by `## \d{4}-\d{2}-\d{2}` headers.
2. Look up the most recent `paula_sf_run_audit` row for `(opp_id, field)`. Get its `section_hashes`.
3. For each existing section in current SF value:
   - If `current_hash[date] == audit_hash[date]` AND `audit_authored_by[date] == 'paula'` AND `frozen=false`: section is **mutable Paula content** — could in theory be replaced, but per §8 we never replace existing dated sections, only prepend new dates.
   - If `current_hash[date] != audit_hash[date]` AND prior `audit_authored_by[date] == 'paula'`: human edited Paula's section. **Mark `authored_by='human'`, `frozen=true`, `first_human_edit_run_id=current_run_id`.** Do NOT touch this section ever again.
   - If section is missing from current SF (deleted by human): record `deleted_by_human=true`, `frozen=true` for that date in next audit. Don't try to recreate.
   - If `audit_authored_by[date] == 'human'` already: leave as-is, propagate flags forward.
4. **New section (top of field) is always written** with today's date — fresh dated block, never collides.

**Per-run audit write:** the new audit row's `section_hashes` is the **forward-merged union** of:
- All prior sections' state (preserving authorship + frozen flags)
- Today's new section (`authored_by='paula'`, `frozen=false`)

**Hash update on already-`human` sections:** if a section was already `authored_by='human'` in the prior audit and the human edits it again, the audit row stores the **NEW current hash** (so subsequent runs see the latest state for restore-tool comparison and detection of further changes), but `authored_by` and `frozen` flags STAY at `'human'`/`true` forever (sticky-frozen invariant). The hash is observational; the flags are load-bearing.

This means: subsequent runs can reconstruct full provenance for every section ever written. Restore tool (§11 task 11) uses this to know what's safe to revert.

**Canonicalization before hashing (unchanged from v3):**
- Strip `\r` (Salesforce CRLF normalization).
- Trim trailing whitespace per line.
- Unicode NFC normalization.
- Strip leading/trailing blank lines from section body.
- Apply consistently to both Paula's own write (pre-store hash) and read-back (compare hash).
- Documented as `canonicalize_for_hash(s: string) -> string` with unit tests in §12.1.

**Whole-field strategy by field type:**

- **`NextStep` (single-line, overwrite semantics):** whole-field hash. Compare current SF value's hash vs `new_value_hash` from last audit row.
  - Match → still Paula's most recent write → safe to overwrite with new summary.
  - Mismatch → human (or another bot) edited → freeze this field, log `skipped_human_edit_next_step`.

- **`Deal_Comments__c` and `Blocker__c` (multi-section append, FIFO):** per-section reconciliation per above.

**FIFO drop with archival:** when adding a new section pushes total length over `field_length`, drop the oldest section. **If oldest's `authored_by='human'` OR has `frozen=true`**, archive it to `paula_sf_dropped_sections {opp_id, field, section_date, content, dropped_at, was_human_edited:bool, frozen_reason:text}` BEFORE dropping. Send WhatsApp warning if archived edit was human-touched.

**SystemModstamp tripwire:** if `SystemModstamp_now > SystemModstamp_phase1` AND none of the 3 target field hashes changed → benign (Owner change, Stage change, etc) → proceed. Otherwise route through above.

### 7.1.5 First-write seed behavior (NEW v4)

The very first time Paula writes to `Deal_Comments__c` or `Blocker__c` on a given opp, there is NO prior audit row. The field may already contain:

- Empty string → write fresh dated section above.
- Existing human content (e.g., the screenshot Rasheed shared shows real content in all 3 fields) → **seed it as human-authored**:
  1. Treat the entire current content as a single virtual section with `date='before-paula'`.
  2. Hash it canonically and store as `section_hashes['before-paula'] = {hash, authored_by:'human', frozen:true, first_human_edit_run_id:current_run_id}` in audit.
  3. Prepend today's section above. Final field value: `## YYYY-MM-DD\n<paula's new content>\n---\n<existing human content unchanged>`.
  4. On every subsequent run, the `before-paula` section is treated as immutable (sticky-frozen).
  5. FIFO drop on the `before-paula` section archives it (since `authored_by='human'`) — preserving forensic record.

**Why this matters:** it satisfies S3 ("0 human-edit overwrites ever") on the very first run. Without this, Paula could blow away pre-existing human content because there's no prior audit to compare against.

### 7.1 (continued)

**Why this works:** content hash with canonicalization is round-trip-safe for plain-text fields (verified by Phase 0 rich-text rejection). Section-level hashing with sticky authorship makes the freeze surgical AND permanent — humans annotate history once, Paula never forgets.

**Right before write**, do a fresh `sf_query`:
```sql
SELECT LastModifiedDate, LastModifiedById, SystemModstamp,
       NextStep, {{dc}}, {{bl}}
FROM Opportunity WHERE Id=:opp_id
```

(Hashing strategy + first-write seed behavior moved to dedicated subsections above for clarity.)

### 7.2 Gate 2 — `If-Unmodified-Since` precondition

SF supports a header (`If-Unmodified-Since`) on PATCH. Send `LastModifiedDate` from gate 1 fetch. If SF returns `412 Precondition Failed` → opp changed in the millisecond between fetch and write → log + skip with `status='skipped_concurrent_edit'`.

(Combined with gate 1, this is belt-and-suspenders. Either gate alone has a sub-second hole.)

### 7.3 Gate 3 — No-op detection

If `new_value == current_value` (verbatim) for a field → don't write that field. If all 3 → skip opp with `status='noop'`. (No-op detection here uses string equality, NOT marker text — fixes v1 marker-defeat issue.)

### 7.4 Gate 4 — Per-opp rate limit

- `NextStep`: max 1 write per opp per 7 days (prevents whipsaw from Haiku rephrasing same content).
- `Deal_Comments__c` and `Blocker__c`: every run OK (append semantics, see §8).

### 7.5 Gate 5 — Confidence

If output has `null` for `next_step` → demote to: write only `deal_comments` if it has new evidence. Don't blank `NextStep`. (Never write empty string.)

### 7.6 Gate 6 — Per-opp cost containment via serial fan-out (rewritten v4)

**Operational reality (verified in `chief-agents/src/phases/act.ts:74-79`):** each agent has a **max-1-task-in-progress guard**. So if the dispatcher enqueues 30 child tasks for Paula, the chief-agents event loop processes them **serially**, one at a time. This is by design and v4 leverages it for cost containment.

**Architecture:**
- The cron-fired `agent_tasks_v2` row (`type='sf_pipeline_dispatch'`, priority=high) is a **lightweight dispatcher**.
- Dispatcher (Sonnet, `maxTurns=3`, `maxThinkingTokens=2000`):
  - Phase 0 confirmation check
  - Phase 1 SOQL fetch + Phase 2 signal harvest (cheap tools, no per-opp Haiku yet)
  - For each opp in scope: enqueue ONE child `agent_tasks_v2` row (`type='sf_pipeline_opp'`, params={opp_id, current_values, current_section_hashes, signals_bundle}).
  - Enqueue final digest task with `dependencies = [all child task ids]`.
  - Exit. Total dispatcher tokens ≤ 5K → ~$0.05.
- **Per-opp worker** (one task per opp):
  - Sonnet via `executeWithSDK(prompt, {maxTurns: 8, maxThinkingTokens: 3000})`.
  - Tools allowlist: signal-bundle is already passed in params (no fetch); only `sf_query` (for re-fetch gate), Haiku invocation tool, `sf_update_opportunity`, `paula_audit_write`.
  - Cost reported per-task by sdk-runner after completion.
  - **Hard cap per opp: $0.50** — enforced two ways:
    1. **Pre-call:** `maxTurns=8` + `maxThinkingTokens=3000` cap output token budget.
    2. **Post-call:** if `agent_tasks_v2.cost_usd > 0.50`, mark opp `failed_cost_cap`, freeze that opp from this run + next 7 days (rate-limit).
- **Run-wide cap: $10** — checked synchronously by a **cost-watcher task** that runs as a separate `agent_tasks_v2` row (`type='sf_pipeline_cost_watcher'`, priority=high) with a different agent identity (a system "PaulaWatcher" agent — same org, different agent_id, so its own task slot, doesn't block Paula). The watcher polls `agent_tasks_v2` every 30s; if cumulative `cost_usd` for the current dispatcher's children exceeds $9.50, it cancels remaining queued children (`UPDATE … SET status='cancelled', cancelled_reason='cost_cap'`) and sends WhatsApp.

**Pending queue drain (v4.1 — escalation, not silent drop):** opps cancelled by cost-cap go to `paula_sf_run_pending {opp_id, reason, queued_at, requeue_attempts}`. Next scheduled run, dispatcher reads this table FIRST and prepends pending opps to the queue, then adds fresh opps.

If an opp has been pending **>7 days OR `requeue_attempts >= 3`**: instead of silently dropping, send WhatsApp to Rasheed:
```
⚠️ Coppel-retail pendiente 9 días en cost-cap.
Reintentar (manualmente):
  ✅ Sí, re-procesar próximo run (queue_attempts reset)
  ⏸  Pausar este opp 30 días
  ❌ Quitar permanente
```
Row stays in pending until Rasheed answers (no silent abandonment). Audit row written on his decision.

**Why this works:**
- Each opp is its own SDK invocation → cost observable between opps, not just at run end.
- `maxTurns=8` per opp puts a hard ceiling on orchestrator wandering.
- One bad opp can't burn the whole budget.
- Serial-by-design (max-1-task-per-agent guard) makes cost-cap enforcement straightforward — no race between enqueue-and-check.
- Wall-clock for 30 opps at ~60-90s each: 30-45 min. Acceptable for unattended Mon+Fri runs.

**Telemetry per opp:** `paula_sf_run_audit.haiku_tokens`, `sonnet_tokens`, `cost_usd`, `turns_used` columns populated from SDK `result` block.

**`agent_budgets` integration:** existing `agent_budgets` table caps Paula's daily spend ($100/day per memory). The per-opp cap and run-wide cap layer on top — three nested limits.

**Required code change (added to §11 task 7):** extend `chief-agents/src/sdk-runner.ts` `executeWithSDK` signature from current hardcoded `maxTurns: 15` to:
```ts
function executeWithSDK(
  prompt: string,
  opts?: { maxTurns?: number; maxThinkingTokens?: number; model?: string }
): Promise<SDKResult>
```
Defaults preserved (`maxTurns: 15` if `opts.maxTurns` is undefined). SDK option names match camelCase per `@anthropic-ai/claude-agent-sdk` runtime types: `maxTurns`, `maxThinkingTokens`. This is a 5-line change.

---

## 8. Phase 5 — Write to SF (append vs overwrite, explicit)

### 8.1 NextStep (255 chars) — **OVERWRITE**
- Replace entirely with new summary.
- Rationale: 255 chars is one short sentence; keeping history is impractical.
- Safety: gate 4 caps to 1×/week per opp; freeze gate prevents stomping a fresh human edit.

### 8.2 Deal Comments — **DATED-SECTION APPEND with FIFO**
- Format: dated sections separated by `\n---\n`. Each section starts with `## YYYY-MM-DD\n`.
- New write **prepends** today's section (most recent on top).
- Keep at most last 4 sections. When adding a 5th, drop the oldest.
- Truncate any single section to `(field_length // 5)` chars to ensure 4 always fit.
- Audit `prev_value` always captures pre-write content for restore.

### 8.3 Blocker — **DATED-SECTION APPEND with FIFO**, same rules

### 8.4 Write call

`sf_update_opportunity(opportunity_id, fields)` (existing).

If new MCP support for `If-Unmodified-Since` header isn't in place: extend `sf_update_opportunity` to accept optional `if_unmodified_since` arg in this PR.

### 8.5 Failure modes

| SF error | Handler |
|---|---|
| `INVALID_SESSION_ID` | Refresh via `_shared/salesforce.ts`, retry once |
| `INVALID_FIELD` | Wipe `paula_sf_field_map.confirmed_at`, alert, halt run |
| `STRING_TOO_LONG` | Re-truncate to `length-100`, retry once; else fail this opp |
| `412 Precondition Failed` | Skip this opp this run (per Gate 2) |
| `INSUFFICIENT_ACCESS` | Disable that field for that opp in `paula_sf_field_disabled`, alert once, continue |
| `REQUEST_LIMIT_EXCEEDED` | Backoff 30s/60s/120s × 3; then push remaining to `paula_sf_run_pending`, exit |
| Other 4xx | Fail this opp, log full body, continue |
| Network 5xx | 2 retries with backoff; then fail this opp |

---

## 9. Phase 6 — Audit + WhatsApp digest + observability

### 9.1 Audit table

```sql
-- migration 108_paula_sf_field_map.sql (combined with field map)
CREATE TABLE paula_sf_run_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid,
  agent_task_id uuid,                -- v2 chief-agents task
  org_id uuid NOT NULL,
  sf_opportunity_id text NOT NULL,
  opportunity_name text,
  scope text NOT NULL,               -- 'rasheed_canary' or 'rasheed_all'
  status text NOT NULL,              -- see below
  fields_written text[],
  prev_values jsonb,
  new_values jsonb,
  prev_hashes jsonb,                 -- the source-of-truth hashes used by §7.1
  new_value_hashes jsonb,
  signals_summary jsonb,             -- {emails:N,calls:N,internal_dropped:M}
  citation_stats jsonb,              -- {claims_total, claims_stripped, sources_unmatched}
  reason text,
  cost_usd numeric(10,6),
  duration_ms int,
  haiku_tokens jsonb,                -- {input,output,cache_read}
  sonnet_tokens jsonb,
  restored_from_run_id uuid,         -- non-null = this is a restore record
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON paula_sf_run_audit (sf_opportunity_id, created_at DESC);
CREATE INDEX ON paula_sf_run_audit (workflow_run_id);
CREATE INDEX ON paula_sf_run_audit (status);

-- Statuses (canonical):
-- 'updated', 'noop', 'skipped_human_edit', 'skipped_concurrent_edit',
-- 'skipped_no_signals', 'skipped_rate_limit', 'skipped_cost_cap',
-- 'failed_summarize', 'failed_write', 'failed_anthropic_outage',
-- 'failed_summarization_circuit', 'failed_other'
```

### 9.2 WhatsApp digest (always sent, in English per §16 #4)

Sent via `bridge.yuno.tools` to Rasheed's number using the existing Chief bridge. Template:

```
🔄 Paula — SF pipeline (canary)
Mon 2026-05-12 09:03 MX

✅ 2 updated
   • Coppel-retail (Comments+Blocker)
   • Bancoppel POS (NextStep+Comments)
⏭️  1 no changes (Coppel Pay — no new signals)

Cost: $0.42 / $10
Next run: Fri 2026-05-15 09:00
Audit: https://chief.yuno.tools/agent-runs/<id>
```

If there are skipped/failed: list them.

### 9.3 Failure escalation (per §16 #2 update 2026-05-07)
- 1 failed run → WhatsApp + audit row, continue schedule.
- 2 consecutive failed runs → **AUTO-PAUSE** with mandatory notification:
  - WhatsApp to Rasheed via Chief bridge: *"🚨 Paula auto-paused after 2 failed runs. Last error: <reason>. Reactivate: <dashboard URL> or reply ▶️ resume"*
  - Email to rasheed@y.uno with same content + audit link.
  - `UPDATE paula_sf_field_map SET confirmed_at=NULL` forces re-confirmation flow on next manual unpause.
  - Pause persists until Rasheed explicitly unpauses (no auto-resume).
- 3+ consecutive failures while paused → no further escalation (already paused; just informational ping if it tries to fire).

### 9.4 Cost tracking
- Per-run cost summed from `cost_usd` per audit row + Sonnet orchestrator overhead from `agent_runs` (existing table).
- Daily roll-up to `daily_cost_report` (existing).
- Alert threshold: weekly cost > $50 → WhatsApp.

---

## 10. Edge cases (consolidated, fixes v1 review nits)

| # | Case | Handling |
|---|---|---|
| 1 | Opp has no Account | Skip, log `no_account` |
| 2 | Account.Website + contacts both empty | Skip emails, still run Gong |
| 3 | Account name <4 chars or generic ("Test") | Skip with reason |
| 4 | Multiple opps for same Account (Coppel x3) | Process independently; each summary cites only its subset |
| 5 | Opp moves to Closed mid-run | Gate 1 re-fetch catches via `IsClosed` check, skip |
| 6 | SF rate limit | Backoff 3×, then push to `paula_sf_run_pending` |
| 7 | Gmail token expired | Auto-refresh via `refresh-google-token` (existing edge fn), 1 retry |
| 8 | Gong API down | Skip Gong, run email-only summary, audit `gong_unavailable=true` |
| 9 | Haiku output malformed | 1 retry; if still bad → `failed_summarize` for that opp |
| 10 | SF schema changed (admin shrunk a field) | Phase 0 auto re-introspects on `INVALID_FIELD`; Gate truncate handles `STRING_TOO_LONG` |
| 11 | Cron fires twice | Unique constraint `(agent_task_id, scope)` on `paula_sf_run_audit`-style lock OR pg_cron `LOCK_KEY` |
| 12 | Rasheed on PTO, ownership reassigned | OwnerId filter excludes; resumes when reassigned back |
| 13 | Email auto-replies (vacation, calendar) | Excluded by noreply/notifications regex |
| 14 | Internal-only Gong call | Filtered by `@y.uno`/`@yuno.co` participant ratio |
| 15 | Subdomain in Website (`shop.coppel.com.mx`) | PSL extraction → `coppel.com.mx` |
| 16 | Account renamed in SF | Cache by `AccountId` everywhere, never by name. Re-fetch name each run |
| 17 | DST transition | MX no DST since 2022; cron is UTC anyway |
| 18 | Workflow drifted to draft/disabled | Pre-run health check (cron 30 min before) verifies `paula_sf_field_map.confirmed_at IS NOT NULL`; alerts Rasheed if not |
| 19 | SF refresh token revoked | First 401-after-refresh detected; alert + halt |
| 20 | Spanish hedge phrases evade English regex | Phase 6 hedge-list now multilingual; documented |
| 21 | LastModifiedDate updated by SF Flow/trigger (not human) | Hash check (§7.1) is the truth — Flow-driven updates that don't change content don't trigger freeze |
| 22 | Two opps share an email (CC'd) | Email is added to both opps' bundles; summaries diverge by topic |
| 23 | Outbound emails from Rasheed | Included — often contain commitments. Filter only if from `noreply@` |
| 24 | DocuSign / Calendly notifications | Excluded by sender regex |
| 25 | Action items in Gong tagged for someone else | Include — context useful even if not Rasheed-action |

---

## 10.5 Pre-run health check (NEW v3 — explicit checklist)

Runs as a separate pg_cron job 30 min before each scheduled Paula run (Mon+Fri 14:30 UTC).

```
☐ paula_sf_field_map.confirmed_at IS NOT NULL for org
☐ salesforce_connections.is_active=true AND token refreshable
   (test: GET /services/data/v59.0/limits returns 200)
☐ ae_integrations(provider='gmail') has refresh_token + tested via Google API ping
☐ ae_integrations(provider='gong') has access_token + tested via Gong /v2/users/me
☐ Anthropic API ping: 1-token completion request returns 200 within 5s
☐ agent_tasks_v2 has no row for Paula stuck in 'in_progress' > 30 min
☐ agent_budgets.cost_usd_today < cap × 0.8 (room for run)
☐ paula_sf_run_audit last 5 runs not all 'failed_*'
☐ Last run finished (no orphan dispatcher task)
```

If any check fails → WhatsApp alert + email to rasheed@y.uno + record blockers in `paula_sf_health_check`. Run still fires on schedule but logs the warning. Critical failures (token unrefreshable, Anthropic down) → **block** the run.

## 11. Implementation tasks (revised order)

| # | Task | Owner | Notes |
|---|---|---|---|
| 1 | Migration `108_paula_sf_pipeline.sql` (field map + audit + pending + dropped_sections + health_check) | engineer | Single migration |
| 2 | Bump `_shared/salesforce.ts` `SF_API_VERSION` from v58→v59 | engineer | Match chief-agents |
| 3 | New MCP tool `sf_describe_object` in `chief-agents/src/mcp-tools/salesforce-tools.ts` | engineer | |
| 3a | New MCP tool `sf_tooling_query(soql)` — calls `${instance_url}/services/data/v59.0/tooling/query?q=…`. Imports `getSalesforceToken()` from `_shared/salesforce.ts` (same auth/refresh as `sf_query`); differs only in URL path (`/tooling/query` vs `/query`) | engineer | For FieldDefinition/FlowDefinition queries (§3.2 step 4) |
| 4 | Extend `sf_update_opportunity` to accept `if_unmodified_since` header | engineer | |
| 5 | New MCP tools `paula_field_map_get/set` + `paula_audit_write` + `paula_digest_send` | engineer | Wrap Supabase calls |
| 6 | Bundle public-suffix-list JSON in chief-agents (small, ~100KB) | engineer | For domain extraction |
| 7 | Extend `chief-agents/src/sdk-runner.ts:136` `executeWithSDK` signature to accept `{maxTurns?, maxThinkingTokens?, model?}` overrides (5-line change, see §7.6 spec). Defaults preserved | engineer | Required for per-opp cost cap |
| 7a | Provision `PaulaWatcher` system agent: INSERT into `agents` (org=Yuno, role='cost-watchdog', tier='watcher', capabilities=[]) + role-tools allowlist `[agent_task_query, agent_task_cancel, paula_digest_send]`. Seed in migration 108 | engineer | Owns cost-watcher tasks (§7.6); needs separate agent_id so its tasks don't compete for Paula's slot |
| 7b | Add task-type capability routing: `sf_pipeline_dispatch` + `sf_pipeline_opp` for Paula, `sf_pipeline_cost_watcher` for PaulaWatcher | engineer | `chief-agents/src/types.ts` |
| 8 | Two structured prompts: dispatcher (fans out per-opp) + per-opp worker (full Phases 1-5 single-opp). Stored as `.md` files in `chief-agents/src/prompts/paula-sf-*.md` | engineer | Per-opp prompt enforces `max_turns=8`, `max_thinking_tokens=3000` |
| 9 | SQL function `paula_enqueue_sf_run(scope text)` + pg_cron `paula_sf_cron` calling it | engineer | Function does the INSERT into agent_tasks_v2; cron just calls function. Mon+Fri 15:00 UTC |
| 10 | Pre-run health check cron — runs at T-30min, see §10.5 for explicit checklist | engineer | |
| 11 | Restore edge function `paula-sf-restore` (see §11.2 for spec) | engineer | |
| 12 | Provision dedicated SF user `paula.bot@yuno.co` (manual, optional v1.5) | Rasheed | Cleaner identity |
| 13 | DPA confirmation (HARD GATE — see §11.1) | Rasheed/legal | Block deploy until signed-off |
| 13a | Create stub `tasks/paula-sf-dpa-notes.md` with checkboxes for DPA evidence | engineer | Required artifact path for §11.1 |
| 14 | Tests (unit + integration) | engineer | See §12 |
| 15 | Smoke test: 1 manual canary run dry-run=true | engineer | Inspect Coppel x3 |
| 16 | First live canary run | Rasheed | Eyes-on |
| 17 | 4 clean canary runs → auto-promotion prompt (§4.3); Rasheed approves via WhatsApp | Rasheed | Hard gate (auto-detected, manual confirm) |

## 11.2 Restore tool spec (NEW v4)

`paula-sf-restore` edge function. Inputs: `{opportunity_id, run_id, force?:bool}`.

**Algorithm:**
1. Read target audit row by `(opportunity_id, run_id)`.
2. Read current SF values for the 3 fields.
3. **Intervening-edit detection:** for each of the 3 fields, compute current canonicalized hash; compare to audit's `new_value_hashes[field]`.
   - If match → "no edits since Paula wrote it" → safe to restore `prev_values[field]`.
   - If mismatch AND `force != true` → REFUSE restore for that field, return `{field: 'modified_since_paula_write', current_hash, audit_hash}` to caller. Caller decides whether to `force=true`.
   - If mismatch AND `force=true` → write `prev_values[field]` anyway, log `forced_restore_over_intervening_edit=true` in new audit row.
4. Write reverted values via `sf_update_opportunity` (with `If-Unmodified-Since` header from current `LastModifiedDate`).
5. Insert new audit row with `restored_from_run_id=<original-run-id>` and `status='restored'`. Section_hashes updated to reflect post-restore state.

**CLI:** invoked as `curl -X POST .../paula-sf-restore -d '{...}'` OR via dashboard button. Both routes require auth (Rasheed's OAuth or admin token).

**Logging:** every restore call logs to `paula_sf_run_audit` with `status='restored'` and `signals_summary={original_run: <id>, fields_restored: [...]}`.

## 11.1 DPA acceptance criteria (NEW v3)

Hard gate before any production write. Required artifacts (stored in `tokens.md` or shared legal folder):

1. **Anthropic enterprise / commercial DPA on file** — confirms data sub-processing terms, sub-processors list, data residency.
2. **Yuno legal sign-off** — written confirmation (email or doc) that:
   - Sending Gong call transcripts of customer conversations to Anthropic is within Yuno's existing customer agreements.
   - LFPDPPP (México) compliance scope: Anthropic counted as a known sub-processor in Yuno's privacy notices.
   - For BR future tenants: LGPD treats this as an international data transfer; needs adequacy or SCCs (out of v1 scope but flagged).
   - PII redaction at source (§6.2 step 4 expanded scrub) is acceptable mitigation.
3. **Annotated review** — one paragraph in `tasks/paula-sf-dpa-notes.md` documenting the decision, signed off by Rasheed (as eng lead) + Yuno legal contact.

If any of the above is missing, deploy blocked. Workflow `paula_sf_field_map.confirmed_at` cannot be set without this artifact existing (enforced by health check).

---

## 12. Testing plan

### 12.1 Unit
- PSL domain extractor: `https://shop.coppel.com.mx/x` → `coppel.com.mx`
- Citation cross-check: bundle with calls=[{id:A,date:2026-05-01}], output cites date=2026-05-02 → strip
- Hedge phrase detector: ES + EN
- Length truncate at sentence boundary
- Hash equality survives re-encoding (UTF-8 normalization)

### 12.2 Integration (against SF prod, READ-only / dry_run)
- Phase 0 introspection on Yuno's actual Opportunity object
- Phase 1 SOQL returns expected count for Rasheed
- Phase 2 fetches actual Coppel-domain emails + Gong calls
- Phase 3 produces valid JSON for known-good signal bundle
- Phase 4 freeze gate: simulate human edit between Phase 1 fetch and Phase 5 write — must skip

### 12.3 Smoke (canary, dry_run=true)
- Inspect `paula_sf_run_audit` rows for Coppel x3
- Confirm `prev_values` matches SF UI screenshot user shared
- Confirm `new_values` would be sensible (length OK, language Spanish, citations valid)
- WhatsApp digest delivered

### 12.4 Soak (canary live)
- 4 consecutive Mon+Fri runs without `failed_*` status
- Manual SF UI check after each run
- 0 `skipped_human_edit` false positives (Rasheed reports if any of his manual edits were stomped)

### 12.5 Chaos
- Manually expire SF token → confirm refresh
- Manually shrink `Deal_Comments__c` length to 50 in sandbox → confirm truncate
- Disconnect Gmail token → confirm Gong-only fallback
- Inject a fake citation `(call 2099-01-01)` into Haiku output via test stub → confirm strip
- Simulate Anthropic 429 spike → confirm circuit breaker

---

## 13. Runbook (oncall, recovery, kill switches)

### 13.1 Roles
- **Primary oncall:** Rasheed (rasheed@y.uno, WhatsApp +52…)
- **Secondary:** TBD (must be assigned before fan-out from canary)
- **Out-of-hours SLA:** next business day for non-P0; immediate for P0 (= S3 violation: human edit overwritten)

### 13.2 Recovery procedures

| Incident | Action |
|---|---|
| Run failed (single) | No action — auto-retry on next schedule |
| 2 consecutive failures | Check WhatsApp alert. Run `SELECT * FROM paula_sf_run_audit WHERE status LIKE 'failed_%' ORDER BY created_at DESC LIMIT 20`. Decide: fix or pause |
| Wrong content written to a single opp | `paula-sf-restore --opp <id> --run-id <id>` |
| Wrong content across run | `paula-sf-restore --run-id <id> --all` |
| P0 — human edit overwritten | Restore from audit immediately; root-cause via gate logs; freeze workflow until fix verified |
| Cost spike | Check digest; if real signal, adjust cap; if bug, pause |
| Anthropic outage | Workflow auto-skips with `failed_anthropic_outage`; resumes next run |

### 13.3 Kill switches (in order of severity)
1. **Skip 1 run:** `UPDATE paula_sf_field_map SET confirmed_at = NULL WHERE org_id=…` — forces reconfirm, run aborts if Rasheed doesn't reply.
2. **Pause schedule:** `SELECT cron.unschedule('paula_sf_cron')`.
3. **Disable agent:** `UPDATE agents SET status='paused' WHERE id=Paula`.
4. **Hard kill:** Railway env var `PAULA_PIPELINE_DISABLED=1` — handler exits immediately, regardless of other state.

---

## 14. Cost model (rewritten v3 — realistic Sonnet multi-turn)

Per-opp worker (Sonnet `max_turns=8`, prompt-cached):
- Input tokens: ~10-15K avg/turn × 8 turns = ~80-120K total. With 90% cache hit on system prompt → effective billed ~30K @ $3/M = $0.09 + cache reads ~90K @ $0.30/M = $0.027.
- Output tokens: ~500/turn × 8 = ~4K @ $15/M = $0.06.
- Haiku summarizer (within the worker): ~3K input + ~400 output @ $0.80/M / $4/M = $0.004.
- **Per-opp realistic: ~$0.18.** Hard cap $0.50 leaves margin for outliers.

Dispatcher (Sonnet `max_turns=3`):
- Phase 0 + Phase 1 + fan-out + digest = ~$0.05 fixed per run.

Per-run estimates:
- 3 opps canary: $0.05 + 3 × $0.18 = **~$0.59**
- 30 opps fan-out: $0.05 + 30 × $0.18 = **~$5.45**
- 100 opps: $0.05 + 100 × $0.18 = **~$18.05** — would exceed $10 cap, defers ~46 opps to overflow.

Hard cap **$10** comfortable for fan-out (≤ 55 opps). At 30 opps we have ~45% headroom for prompt drift / cache misses.

Annual (Mon+Fri = 104 runs/yr × $5.45 at 30-opp fan-out): **~$566/yr**. Acceptable.

If real costs exceed model by >50% in first 4 runs, raise the cap or shorten max_turns; Sonnet is the dominant cost.

---

## 15. Risks (residual, post-fix)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hash collision on legitimate human re-edit (typed exactly same string) | ~0 | Med | Live with it |
| Phase 0 confirmation prompt unanswered for 2+ schedules | Low | Low | Pings every run; eventually Rasheed sees it |
| Haiku regression in a new model release | Med | Med | Pin to specific snapshot `claude-haiku-4-5-20251001`; re-pin only after eval |
| SF Yuno admin renames `Deal_Comments__c` | Low | Med | Auto-heal via INVALID_FIELD → re-introspect → re-confirm |
| Anthropic-side DPA scope changes | Low | High | DPA gate (§11 task 13) re-checked quarterly |
| Sales org shifts to a different Opp object (Custom__c) | Low | High | Plan only handles standard `Opportunity`. Out of scope |

---

## 16. Open questions — ANSWERED 2026-05-07

1. **DPA scope** — RESOLVED. Per Rasheed: content processed is **deal-relationship summaries**, NOT customer banking data (no account numbers, balances, financial PII). Yuno's existing Anthropic enterprise DPA covers B2B sales call processing. §11.1 downgraded from hard blocker to **informational note** (still complete the DPA stub for audit trail, but doesn't gate canary deploy).
2. **Secondary oncall** — UNCLEAR. To clarify: this is the backup person if Paula breaks while Rasheed is on PTO/asleep. v1 default: **Rasheed solo, no secondary**. Auto-pause kicks in after 2 failed runs; Rasheed unpauses when back. Acceptable for canary scope. Re-evaluate at fan-out.
3. **SF Flows touching the 3 fields** — YES, Flows exist. **New requirement:** Phase 0 must enumerate active Flows and surface them. If a Flow legitimately writes to `Deal_Comments__c`/`Blocker__c`/`NextStep`, our hash-detection will treat the Flow's edit as "human" → freeze. Mitigation strategy in v4.1:
   - Phase 0 lists all active Flows that touch these fields → WhatsApp to Rasheed.
   - Rasheed marks each Flow as `friendly` (Paula respects its writes) or `disable_for_paula` (Yuno admin disables it).
   - Stored in new column `paula_sf_field_map.friendly_flow_ids text[]`.
   - Hash-detection: if mismatch detected AND `LastModifiedById ∈ friendly_flow_user_ids`, treat as benign (don't freeze that field).
4. **Language** — RESOLVED: **all output in ENGLISH** (digest, prompts, NextStep/Deal Comments/Blocker writes). Override v3 default of Spanish. Update Phase 3 prompt + §9.2 digest template.
5. **SF identity** — RESOLVED: **hash-based v1 only**, no separate `paula.bot` user. Paula writes via Rasheed's OAuth (his account). v1.5 task removed.
6. **Field types** — DEFER to Phase 0 introspection. Will discover and confirm via WhatsApp.
7. **Field History + no-signals behavior** — RESOLVED: if no new signals → don't write (already in §7 gate). Still process to check (already in plan). Field History Tracking — Phase 0 surfaces, non-blocking.

---

## 17. v2 backlog

- Multi-AE fan-out
- Gong webhook event-driven trigger (write within 30 min of call end)
- Auto-create SF Tasks for Gong action items
- LinkedIn DM signals
- Confidence score per field shown in digest
- Self-eval: 24h after a write, Paula re-reads + reports drift to a `paula_sf_eval` table
- Multi-language digest (EN/ES/PT)
- Web UI for audit/restore (vs. SQL + restore CLI)
