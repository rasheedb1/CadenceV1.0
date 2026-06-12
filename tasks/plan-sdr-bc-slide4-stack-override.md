# Plan — SDR BC slide 4 payment-stack manual override

Goal: in the New SDR BC wizard (Step 2), let the AE see and edit the three
slide-4 columns — **Acquirers**, **Gateways / PSPs**, **Payment methods** —
pre-filled with whatever research inferred (the same values the deck would
otherwise display). Anything left as the inferred value stays auto; edits
become explicit overrides that win on slide 4 (and slide 6 orchestration).

User decision (2026-05-27): **Pre-fill + editable** (not blank inputs).

## Tasks

- [ ] `_shared/sdr-bc-research-core.ts`: add `buildPaymentStack(intel, topCountries)`
      → `{ acquirers, gateways, methods, inferredFromRegion }`. Moves
      `splitPspsIntoAcquirersAndGateways` + `buildMethodsList` + the regional
      fallback merge here so generate + research share one source of truth.
- [ ] `sdr-bc-research/index.ts`: include `suggested_payment_stack` in the
      response (acquirers/gateways/methods) so Step 2 can pre-fill.
- [ ] `sdr-bc-generate/index.ts`: parse `acquirers_override` /
      `gateways_override` / `methods_override` (string[]). Use them on slide 4
      and slide 6; suppress the "inferred from regional benchmarks" disclaimer
      when acquirers/gateways are overridden.
- [ ] `NewSdrBcForm.tsx`: add a "Payment stack (slide 4)" section to Step 2 with
      three editable tag lists, pre-filled from `suggested_payment_stack`. Send
      overrides only for columns the AE changed.
- [ ] Type-check frontend (`tsc`), deploy `sdr-bc-research` + `sdr-bc-generate`.

## Notes / invariants
- Math (TPV/AR/cost) is untouched — slide 4 is descriptive only.
- Methods always include the Visa/Mastercard/Apple Pay/Google Pay floor.
- Backward compatible: no overrides → identical behavior to today.
