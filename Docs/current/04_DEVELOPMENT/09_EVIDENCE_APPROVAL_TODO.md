# Evidence Approval TODO

Updated: 2026-08-16

## Confirmed policy

- [x] Numeric/period values are not independently validated against Planning values at the Generation approval gate.
- [x] Official authoritative source: one source is sufficient.
- [x] Non-official source: obtain at least one independent corroborating source through free web search before Generation.
- [x] Generation must not start before the required Evidence state is satisfied.
- [x] Do not add a paid search API solely for corroboration.

## Implementation

- [x] Preserve the existing source-display changes in `481b74d`.
- [x] Remove numeric/raw-value equality as a blocking condition in `VerificationClaimEvidenceMatch`.
- [ ] Change `VerificationClaimPolicy` so high-risk Claims pass with either one authoritative official source or at least two independent institutions when no official source exists.
- [ ] Confirm the pre-generation discovery path performs free web search for non-official Evidence and adds the corroborating source before Generation.
- [ ] Do not silently fall back to Generation when corroborating Evidence is missing.
- [ ] Add regression tests for:
  - [ ] official single source
  - [ ] non-official single source blocked
  - [ ] non-official source + one independent corroborating source allowed
  - [ ] numeric/period mismatch does not block Evidence Match
  - [ ] `6개월 / 2개월 / 2년` legal Claim regression
- [ ] Run the relevant unit/integration tests.
- [ ] Record the final implementation commit SHA here after verification.
