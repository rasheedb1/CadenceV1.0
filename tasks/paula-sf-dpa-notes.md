# Paula SF Pipeline — DPA & Compliance Notes

**Status:** ⏳ pending sign-off
**Owner:** Rasheed Bayter
**Required by:** Plan §11.1 — hard gate before any production write

This doc tracks the data-processing-agreement evidence required before Paula auto-writes to production Salesforce on customer call transcripts.

## Required artifacts

- [ ] **Anthropic enterprise / commercial DPA on file**
  - Effective date: ________
  - Sub-processors list reviewed: ________
  - Data residency: ________
  - Storage location: `tokens.md` reference: ________

- [ ] **Yuno legal sign-off on Anthropic processing of customer Gong transcripts**
  - Reviewed by: ________
  - Date: ________
  - Decision: approved / approved-with-conditions / rejected
  - Conditions (if any): ________

- [ ] **LFPDPPP (México) compliance**
  - Anthropic listed as known sub-processor in Yuno privacy notices: yes / no
  - If no, action required: ________

- [ ] **LGPD (Brasil) treatment** — flag for v2 if BR tenants in scope
  - Adequacy decision: ________
  - SCCs in place: yes / no
  - Out of v1 scope: ☐ confirmed

- [ ] **PII redaction at source — verified mitigation**
  - §6.2 step 4 scrub pipeline reviewed: ☐ yes
  - Test cases for RFC, CURP, CLABE, CPF, CARD pass: ☐ yes
  - Source-ID allowlist working (citation cross-check intact): ☐ yes

## Decision

> _One paragraph documenting the final go/no-go decision, rationale, and explicit list of LATAM bank tenants this covers (Coppel, Bancoppel, others). Sign-off names + dates here._

## Review cadence

- Quarterly review of DPA scope: next review ________
- Re-trigger if: new bank tenant added; Anthropic sub-processor list changes; LGPD becomes in-scope.
