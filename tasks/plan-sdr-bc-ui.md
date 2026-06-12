# Plan — SDR BC UI Separation

**Owner:** Rasheed
**Date:** 2026-05-11
**Status:** Building (approved)

## Goal

Separate the SDR BC (cold outreach, SimilarWeb-driven) from Yuno BC (BD managers, manual pricing) in two places:

1. **Chief dashboard `/presentaciones`** — tabs to switch between Yuno BC ↔ SDR BC views
2. **Day 9 of cadence flow** — automated trigger of `sdr-bc-generate` for outreach prospects, BC URL injected into outbound email

## Current state

- Both kinds already persist to same `presentations` table (column `kind` ∈ `'yuno_bc' | 'sdr_bc'`)
- Skills both exist: `/yuno-bc` (rich Phase A/B/C inputs) + `/sdr-bc` (just client + website, auto-everything)
- Edge functions both live: `presentation-create` (yuno_bc) + `sdr-bc-generate` (sdr_bc)
- Frontend at `chief.yuno.tools/bc/<slug>` for yuno; `/sdr-bc/<slug>` for sdr (different deck templates)
- **Gap:** UI in `Presentaciones.tsx` shows everything mixed, single "New presentation" CTA, single base URL

## Changes (UI only — backend already works)

### 1. `src/pages/Presentaciones.tsx` — add tabs

- Tabs at top: `Yuno BC` (default) | `SDR BC`
- `kind` filter applied to query (filter client-side, keep single fetch)
- Per-tab badge color: yuno_bc → green, sdr_bc → blue
- Per-tab base URL:
  - yuno_bc → `https://chief.yuno.tools/bc/<slug>`
  - sdr_bc → `https://chief.yuno.tools/sdr-bc/<slug>`
- Per-tab description text + empty state copy
- "New presentation" CTA changes per tab:
  - Yuno BC tab → existing `NewBusinessCaseForm` (rich inputs)
  - SDR BC tab → new simple form OR WhatsApp deep-link (MVP: WhatsApp, faster to ship)

### 2. `src/components/NewSdrBcForm.tsx` (NEW, optional v2)

Simple 2-field form: `clientName` + `website` → POST to `sdr-bc-generate` edge function → refresh list. v1 ships without this (WhatsApp deep-link); v2 adds for users who don't want to context-switch.

### 3. Day 9 cadence trigger (separate work)

Out of scope for this UI PR. Logged as follow-up:
- Add new `cadence_step.step_type = 'send_sdr_bc'`
- `process-queue` invokes `sdr-bc-generate` with the lead's company
- Resulting URL goes into the send-email template variable `{{sdr_bc_url}}`
- Day-9 email template gains the BC link

## Files to touch

- `src/pages/Presentaciones.tsx` — tabs, filter, per-kind URLs/CTAs

## Out of scope (next iteration)

- `src/components/NewSdrBcForm.tsx` (direct form)
- Day 9 cadence step type + send-email template
- BC PDF endpoint variant for sdr_bc deck
- Solar Navigation new planet for SDR BC (keeping single Presentations planet with tabs)

## Acceptance

1. `/presentaciones` shows two tabs that filter correctly
2. SDR BC rows link to `/sdr-bc/<slug>` correctly
3. Yuno BC rows still link to `/bc/<slug>`
4. Each kind has visually distinct badge
5. "New" button on SDR BC tab opens WhatsApp with `/sdr-bc <ClientName>` pre-filled (consistent with existing regenerate UX)
6. Type-checks pass, dev server boots without errors
