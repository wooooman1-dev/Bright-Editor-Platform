# Evidence Approval Policy

## Status

**CONFIRMED — 2026-08-16**

This document records the approved Evidence policy for pre-generation verification.

## Decision

### 1. Numeric and period values are not independently verified at the approval gate

Values such as `6개월`, `2개월`, `2년`, percentages, dates, and similar literals must not cause Generation to be blocked merely because the discovered source expresses the value differently from the Planning Claim.

The system still requires source-anchored Evidence and Claim relevance. It does not perform a Planning-value-to-source numeric equality check as an approval requirement.

### 2. Official source

A single authoritative official source is sufficient for the Claim.

No second source is required solely because the Claim contains a number or period.

### 3. Non-official source

A non-official source is not sufficient by itself for a high-risk factual Claim.

Before Generation, the Evidence layer must obtain at least **one independent corroborating source** through free web search.

The corroborating source must be independent of the first source/institution and must provide relevant Evidence for the same Claim.

### 4. Generation gate

Generation is allowed only after the required Evidence state is satisfied:

```text
Claim
  ↓
Evidence collection
  ↓
Numeric/period equality check: NOT REQUIRED
  ↓
Official source?
  ├─ YES → one authoritative source is sufficient
  └─ NO  → free web search → independent corroborating source >= 1
  ↓
Evidence requirement satisfied
  ↓
Generation allowed
```

If required corroborating Evidence has not yet been obtained, Generation must not start.

## Cost policy

The corroboration search must use the existing/free web-search capability rather than adding a paid search API solely for this policy.

Search should be performed before Generation and should reuse existing discovery infrastructure where available.

## Implementation status

- [x] Preserve the existing source-display changes in commit `481b74d`.
- [x] Remove numeric/raw-value equality from the Claim Evidence Match approval decision.
- [ ] Require independent corroboration for non-official high-risk Claims in the verification policy.
- [ ] Connect free web search to the pre-generation Evidence enrichment path if the existing discovery path does not already do so.
- [ ] Add regression tests for official single-source, non-official two-source, and numeric/period mismatch cases.

## Regression cases

The following legal Claim pattern must not be blocked merely because numeric literals differ between Planning and Evidence:

- 계약갱신요구권 행사 기간: `6개월` / `2개월`
- 갱신 임대차 존속기간: `2년`

These values are examples of the failure that motivated this policy; they are not themselves Evidence.
