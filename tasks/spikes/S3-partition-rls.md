# Spike S3 — Partitioned `agent_chat_events` + indexed RLS

**Date:** 2026-05-04
**Status:** GREEN (design) — benchmark numbers pending Phase 1 execution
**Time:** 0.5 day

## Verdict

**Design is sound.** The combination of (a) declarative `RANGE` partitioning on `created_at`, (b) composite indexes on `(thread_id, created_at desc, id desc)` and `(org_id, user_id, thread_id)`, and (c) RLS using indexed equality on denormalized `user_id` wrapped in `(select auth.uid())` should hit p95 < 5ms at 10M rows. The hot query reads at most 100 rows from a single B-tree leaf chain inside one partition. The proof is the benchmark in `S3-bench.sql`, to be run in Phase 1 against staging.

## Decision 1 — pg_partman vs. pg_cron fallback → **pg_cron**

`pg_partman` is **not confirmed** as a Supabase-managed extension. The official extensions index lists `pg_cron`, `pgcrypto`, `pg_net`, `uuid-ossp`, `pg_trgm`, `pgmq` (all already enabled in this codebase — see `grep "create extension" supabase/migrations/`), but `pg_partman` is absent from both the docs index and our migration history.

**Choice:** native Postgres declarative partitioning + a `pg_cron` rolling job (`roll_agent_chat_events_partitions()` in the draft). The job runs daily at 03:00 UTC, ensures the next two months exist, and detaches+drops partitions whose upper bound is older than 90 days. This works on every Supabase tier without privileged install.

If `pg_partman` is later confirmed available we can swap mechanics without touching the table shape — the partitions themselves are the contract, not the manager. Cost of cron approach: ~30 lines of plpgsql; benefit: zero supplier risk.

## Decision 2 — uuid v7 vs. v4 → **v4 with composite PK** (`created_at, id`)

Postgres 14/15 (Supabase managed) ships no native uuidv7 generator. Options were:
1. Add a plpgsql `uuidv7()` function (40 lines, runs ~1µs).
2. Use `gen_random_uuid()` (v4) and let `created_at` carry temporal ordering.

**Choice: v4.** Reason: the hot query is `where thread_id = ? order by created_at desc, id desc limit 100`. Ordering inside a thread is by `created_at` already; `id` is the tiebreaker. v7's monotonicity buys us nothing here because the partition key is already `created_at`, and the secondary index is leading on `(thread_id, created_at desc)`. v4 collisions across 10M rows are statistically zero.

Future sharding migration: if we ever shard by id range, we can backfill a `seq bigint` column or migrate ids via a one-shot batch — both are bounded operations on a partitioned table because we only rewrite live partitions.

## Decision 3 — Indexing strategy

Three indexes on `agent_chat_events`, each justified:

| Index | Purpose | Cost |
|---|---|---|
| `(thread_id, created_at desc, id desc)` | Hot query — thread-recent. Walked left-to-right, no sort step. | ~150 MB at 10M rows |
| `(org_id, user_id, thread_id)` | Backstop for RLS predicate when query lacks `thread_id` (e.g. admin tools). | ~100 MB |
| `(turn_id)` | Cancel + audit lookups. | ~80 MB |
| **PK** `(created_at, id)` | Mandatory — partition key must be in PK; provides time-range scans. | included |

`agent_web_threads`: `(user_id, last_message_at desc)` for sidebar; `(org_id, user_id)` for membership joins; `(agent_id, status)` for agent-scoped queries.

We do NOT index `payload` jsonb. Any future search lives in a separate full-text index, not the hot path.

## Decision 4 — RLS design

The textbook footgun is RLS predicates that subquery `organization_members` per row. We avoid it three ways:

1. **Denormalize `org_id` and `user_id`** onto every row of `agent_chat_events`. The bridge sets them at insert time from the `agent_web_threads.org_id` pin.
2. **Equality only**: `user_id = (select auth.uid())`. The `(select …)` wrapper makes Postgres run an `initPlan` once per statement, caching the JWT lookup. Supabase docs benchmark this at ~95% improvement vs. bare `auth.uid()`.
3. **Membership check moves to write path**: the INSERT policy on `agent_web_threads` (writes are rare) does the `EXISTS … organization_members` check; reads on `agent_chat_events` (frequent) only touch the indexed local columns.

Service role bypasses RLS — `chat-bridge` writes events using the service-role connection and re-validates `org_id` against the immutable thread pin in application code. This is the documented Supabase pattern (see `supabase/functions/_shared/supabase.ts` for prior art). Treating RLS as defense-in-depth, NOT primary auth, is consistent with how every other table in this codebase (`agent_chat_events`, `agent_audit_log`, `cadences`, etc.) operates.

## Decision 5 — Audit + idempotency tables

`agent_audit_log` is also partitioned (12-month retention vs. 90-day for events), because admin "what did the agent do last quarter?" queries are the worst case for unpartitioned scans.

`agent_idempotency_keys` is a flat table with a `(created_at)` index and an hourly `pg_cron` job that deletes rows older than 24h. Volume is bounded (~1 row per `POST /messages` per user); no partitioning needed.

## Risks

1. **Partition pruning depends on `created_at` in the WHERE clause.** The hot query in the bridge is `where thread_id = ? order by id desc limit 100`. This is fine because the secondary index `(thread_id, created_at desc, id desc)` already lives inside each partition; the planner walks all current partitions for matching `thread_id` and the LIMIT short-circuits after 100 rows. With 90-day retention that is at most 4 partitions to probe. Adding `and created_at >= now() - interval '90 days'` makes pruning explicit at the cost of edge cases on month boundaries — recommend the bridge add this clause for the resume scenario only.

2. **RLS bypass via service role** is correct for writes but means every bridge insert MUST validate `org_id` against the pinned thread BEFORE writing. We codify this in the bridge module, not RLS. The trigger `tg_agent_web_threads_lock_org_id` makes the pin tamper-proof; thread immutability is the substrate the bridge trusts.

3. **`auth.uid()` semantics** depend on a valid JWT being passed. The bridge verifies JWTs locally with JWKS (plan §9) and forwards the `sub` claim to PostgREST as a normal authenticated session. If JWT verification regresses, RLS reads return 0 rows — a fail-closed mode, which is the desired default.

4. **`pg_cron` partition job failure** silently breaks future inserts. We add an alert: if the next partition isn't present 7 days before month-end, page. Implementation lives in the existing `daily-cost-report` cron pattern.

5. **Index bloat at 10M rows × 90 days retention** ≈ 30M live rows ≈ 1 GB of indexes. Within Supabase Pro's 8 GB default. Re-evaluate at 100M if usage explodes.

6. **`id` collisions across partitions**: PK is `(created_at, id)` so v4 collisions are tolerated at the partition level. A cross-partition collision would require both same id and same `created_at` — astronomically unlikely.

## Verification plan for Phase 1

1. Apply the migration (renamed to the next sequential number, e.g. `102_agent_web_chat.sql`) to a staging Supabase project.
2. Confirm `cron.job` lists `agent_chat_events_roll`, `agent_idempotency_keys_ttl`, `agent_audit_log_roll`.
3. Confirm 3 partitions exist via `select count(*) from pg_inherits where inhparent='agent_chat_events'::regclass`.
4. Run `S3-bench.sql` end-to-end:
   - Seed 10M rows (expect 60–180s on Pro tier).
   - Capture EXPLAIN output for the three hot-query variants. Confirm `Index Scan` (not `Seq Scan` or `Bitmap Heap Scan`) on the leading B-tree, and partition pruning to a single child partition when `created_at` is in the predicate.
   - Run the 1000-trial p95 measurement. **Pass iff p95_ms < 5.**
5. Cross-org probe: from a connection with another user's JWT, query `select * from agent_chat_events where thread_id = '<owner thread>'`. Must return 0 rows.
6. Service-role probe: same query under service role must return rows. Confirms the bridge can read without RLS interference.
7. Partition rolling smoke test: manually call `select roll_agent_chat_events_partitions()`, confirm next-month partition created, idempotent on second call.
8. SIGTERM drain interaction (with Spike S2): confirm an in-flight insert during cron run does not lock contention against the rolling job (DETACH+DROP only touches old partitions, never current).

If steps 4 or 5 fail, do NOT proceed to Phase 1 build — re-evaluate indexes (start by adding `INCLUDE (payload)` to the hot index so reads are index-only).

## Files produced

- `tasks/spikes/S3-migration-draft.sql` — full migration, not numbered, ready for review.
- `tasks/spikes/S3-bench.sql` — benchmark harness (10M seed + EXPLAIN + p95).
- `tasks/spikes/S3-partition-rls.md` — this report.
