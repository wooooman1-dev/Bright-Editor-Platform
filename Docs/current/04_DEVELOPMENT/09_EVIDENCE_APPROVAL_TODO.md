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
- [x] Change `VerificationClaimPolicy` so high-risk Claims pass with either one authoritative official source or at least two independent institutions when no official source exists.
- [ ] Confirm the pre-generation discovery path performs free web search for non-official Evidence and adds the corroborating source before Generation.
- [ ] Do not silently fall back to Generation when corroborating Evidence is missing.
- [x] Add regression coverage for official single source, non-official single source blocked, and non-official two-source approval.
- [x] Add regression coverage showing numeric/period mismatch does not block Evidence Match.
- [ ] Add a dedicated `6개월 / 2개월 / 2년` legal Claim integration regression once the actual discovery fixture/path is confirmed.
- [ ] Run the relevant unit/integration tests.
- [ ] Record the final verified implementation commit SHA here after test execution.

## Current implementation record

- `481b74d`: preserved the source-display/evidence normalization changes.
- `5542e618`: final state of Claim Evidence Match no longer blocks on numeric/raw-value mismatch.
- `2e75a684`: high-risk verification now accepts either one authoritative primary official source or two independent institutions when no official source exists.
- `c23e9bfd`: updated Claim Evidence Match regression tests for the new numeric/period policy.
- `70709d79`: added regression coverage for official single-source and non-official corroboration policy.
- The existing source normalization preserves `search_candidate` sources; the upstream discovery step still needs to be verified to ensure free web search is invoked before Generation whenever corroboration is required.

## Verification status

The code and test changes have been committed remotely, but the test suite has **not** been executed in this environment. Do not mark the implementation fully verified until the local project runs the relevant tests successfully.
