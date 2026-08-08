# Verification Architecture Static Audit

Last updated: 2026-08-08

## 1. Purpose

This document records the current static architecture audit of the Verification Claim, Source Preflight, Generated Claim Binding, Quality and publishing-readiness chain on Draft PR `#42`.

Current verified implementation basis:

```text
Repository: woooooman1-dev/Bright-Editor-Platform
Branch: feat/data-source-multi-connections
PR: #42
Latest implementation HEAD verified by CI: fc2f9e5b5efdfed5e338cef2e7e697bc807ef634
GitHub Actions run: 31240664253
Job: 93060958310
Typecheck: passed
Lint: passed
Test: passed
Build: passed
```

No production Provider call, local `.bright-studio` mutation, WordPress Draft write, Tistory Draft write or public publishing was performed by this audit/update.

This document distinguishes resolved findings from still-open semantic or publishing-boundary work. A successful automated fixture is not treated as live external verification.

## 2. Audited Pipeline

```text
Approval-aware Planning
→ explicit verificationPlan
→ Source Preflight discovery
→ fetched-page validation
→ typed source normalization
→ VerificationSnapshot
→ Verification Generation Gate
→ filtered Generation evidence bundle
→ Generation
→ Generated Claim Binding
→ canonical generatedClaimVerification metadata
→ current-manuscript Quality integrity recheck
→ platform publishing readiness
→ external Draft / schedule execution
```

Primary audited implementation boundaries include:

- `app/application/PlanningContracts.ts`
- `app/application/ContentPlanningStrategy.ts`
- `app/application/ContentPlanningStrategyBase.ts`
- `core/ai/ApprovalSourcePreflight.ts`
- `core/approval/ExplicitVerificationPreflight.ts`
- `core/approval/VerificationClaim.ts`
- `core/approval/VerificationClaimPolicy.ts`
- `core/approval/VerificationGenerationGate.ts`
- `core/ai/VerificationGenerationBundle.ts`
- `core/approval/GeneratedClaimBinding.ts`
- `core/approval/GeneratedClaimVerificationIntegrity.ts`
- `core/quality/QualityEnginePolicy.ts`
- WordPress/Tistory publishing readiness and registered execution routes.

## 3. Verified Architecture Strengths

### 3.1 Explicit Planning is server-owned before Generation

Approval-aware Content automatically enables explicit Verification Planning from canonical approval-policy context. The Planning response defines factual Claims before Generation, while the server owns Claim IDs and fingerprints.

### 3.2 Generation revalidates Verification state

`VerificationGenerationGate` recomputes the Plan fingerprint, checks Snapshot integrity, rejects unknown/duplicate result Claim IDs, re-evaluates Claim policy and exposes only fresh supporting normalized assessments.

Required Claims that do not remain verified block Generation.

### 3.3 Generated verification state is canonical server state

Generation creates `generatedClaimVerification` only after the Generation Gate passes. The stored record contains the VerificationSnapshot, current bindings and bound editorial revision.

### 3.4 Quality rechecks the current manuscript

`evaluateGeneratedClaimVerificationIntegrity()` does not treat a historical binding as sufficient authority. It re-evaluates the Gate and re-runs deterministic binding against the current canonical manuscript.

### 3.5 Registered publishing paths consume the shared Core result

Confirmed current behavior:

- WordPress Draft execution calculates readiness inside `WordPressDraftApplicationService` before external Draft creation.
- normal Tistory Draft execution asserts Generated Claim integrity at the registered API boundary before Playwright execution.
- Tistory schedule readiness inherits the general Tistory `generated_claim_verification` check before schedule reservation/execution.

No WordPress-specific or Tistory-specific factual-source truth engine is required or desired.

## 4. Finding V-01 — Planning / Source Normalization Kind Mismatch

Status: **Resolved at source-normalization boundary**

Original finding:

Planning allowed nine Claim kinds while explicit fetched-source normalization handled only `money`, `ratio` and `general`.

Planning-supported kinds are:

```text
money
ratio
date
dateRange
duration
location
eligibility
legal
general
```

Current `ExplicitVerificationPreflight` now has deterministic normalization branches for all nine kinds.

The server also compares Planning `rawValue` and discovered source values by canonical normalized representation instead of plain display-string equality where supported. Examples protected by automated fixtures include:

```text
50만원 == 500,000원
3% == 3퍼센트
2026-08-01 == 2026년 8월 1일
예금자보호법 제32조 == 예금자보호법 제 32 조
```

The all-kind regression fixture is in:

```text
tests/unit/core/approval/ExplicitVerificationPreflight.test.ts
```

Important boundary: this resolution means all nine kinds can be source-normalized into typed Verification assessments. It does **not** mean Generated Claim semantic re-verification is complete for all nine kinds.

## 5. Finding V-02 — Proposition-changing Money / Ratio Semantics

Status: **Partially Resolved**

### Resolved source-side behavior

Money source normalization now preserves deterministic basis/comparator semantics where explicitly represented or safely derivable from the confirmed Claim context.

Supported money basis includes:

```text
oneTime
daily
monthly
annual
total
perPerson
perHousehold
```

Common Korean forms such as the following are normalized:

```text
월 50만원
500,000원/월
연 600만원
1인당 10만원
가구당 20만원
1회 5만원
```

The Finance Matrix specifically verifies that:

```text
planned: 월 50만원
source: 500,000원
→ same monthly Claim when the confirmed Claim context supplies monthly basis
```

and:

```text
planned: 월 50만원
source: 연 500,000원
→ claim_raw_value_mismatch
```

Money and ratio comparator forms such as `최대`, `최소`, `이상`, `이하`, `미만`, `초과` are also deterministically represented where the canonical type supports them.

Ratio normalization preserves percent vs percentage-point representation and derives the current canonical `rate/share/change` meaning from the confirmed Claim context.

### Still open

`GeneratedClaimBinding` remains primarily token/scalar based. It cannot yet prove that every generated surrounding proposition preserves comparator, basis, subject, scope and all other material qualifiers.

Therefore V-02 is not fully resolved end-to-end until the Generation output / Generated Claim representation preserves those semantics deterministically.

## 6. Finding V-03 — Generated Claim Detection Coverage

Status: **Open — P1 semantic integrity boundary**

High-risk Verification kinds include:

```text
money
ratio
date
dateRange
location
eligibility
legal
```

Current deterministic unsupported-value detection in `GeneratedClaimBinding` is strongest for scalar/text-token forms including:

```text
money
ratio
date
duration
legal article numbers
```

It is not universal semantic fact extraction. In particular, semantic edits to location, eligibility or legal propositions may not always create a new independently detectable scalar token.

A future implementation must not solve this by adding another Quality AI call. Preferred direction is a structured generated factual-claim representation returned inside the existing Generation response so the server can compare it to the verified Plan/Snapshot deterministically.

## 7. Finding V-04 — Generation Bundle Still Uses Legacy Compatibility Projection

Status: **Open — P2 architecture ambiguity**

The canonical Verification model is Claim-ID based, but the current reader-facing Generation evidence instruction is still built from a legacy compatibility projection shaped mainly as:

```text
field
value
evidenceExcerpt
```

That projection can lose semantics already present in the canonical Claim definition, including Claim identity and qualifiers.

Required direction:

- make `claimId` the primary Generation evidence identity;
- preserve normalized verified value and material qualifiers;
- require every `gate.verifiedClaimId` to own at least one trusted source projection;
- keep legacy field/value projection only as non-authoritative compatibility output.

No extra AI call is required.

## 8. Finding V-05 — Schedule Verification Regression Coverage

Status: **Open — P2 regression gap**

Current Tistory schedule readiness is protected by composition:

```text
TistoryScheduleReadiness
→ calculateTistoryReadiness
→ generated_claim_verification
```

However, the schedule-specific test mocks the lower readiness function and does not yet prove the full integration case:

```text
verified manuscript
→ factual edit
→ generated_claim_verification fails
→ schedule readiness false
→ schedule route does not reserve or execute Playwright
```

This can be tested offline without a real Tistory write.

## 9. Finding V-06 — Execution Services Depend on Registered Upstream Verification

Status: **Open — P2 defense-in-depth boundary**

No current registered public route bypass was found.

However, low-level Tistory execution services do not themselves own the full canonical Opportunity / Verification / Quality context. Their safety depends on the registered readiness/API boundary remaining mandatory.

Do not duplicate factual verification inside platform workers. If stronger defense in depth is needed, use a platform-neutral server-owned verified publishing execution ticket/artifact produced after canonical Core checks.

## 10. Bright Finance Regression Matrix

A dedicated offline Matrix now protects common Bright Finance factual shapes:

```text
tests/unit/core/approval/BrightFinanceVerificationMatrix.test.ts
```

Current scenarios:

1. 지원금 — amount, eligibility, application period, location
2. 예금·적금 — ratio, duration, general verification principle
3. 세금·공제 — ratio, reference date, legal basis
4. 대출 — amount, ratio, duration
5. a required planned amount changed by one source must fail closed
6. monthly planned amount must not equal an explicitly annual source amount

The Matrix exercises:

```text
explicit discovered source records
→ source assessments
→ typed normalization
→ temporal/freshness policy
→ VerificationSnapshot
→ VerificationGenerationGate
```

It deliberately uses fixture values and does not encode current real-world policy amounts as product truth.

### What the Matrix found during development

The first Matrix run exposed a real Production gap: `월 50만원` could not be normalized against an equivalent `500,000원` source value because the money basis wrapper was not represented. The Production normalizer was corrected rather than weakening the test.

A later failing run exposed a contradictory test fixture whose discovered date-range value did not literally appear in the fixture page text. The server correctly rejected it with the existing page-value requirement; the fixture was corrected rather than relaxing verification.

This is evidence that the Matrix is exercising fail-closed behavior instead of only happy-path assertions.

## 11. Current Test Coverage Boundary

Now covered strongly:

- strict explicit Planning schema;
- automatic approval-context explicit Planning;
- Bright Finance legacy false-positive regression;
- all nine source-normalization kinds;
- canonical raw-value equivalence for covered representations;
- money basis semantics and monthly/annual mismatch;
- source identity and institution grouping;
- temporal/freshness policy;
- VerificationSnapshot and fingerprints;
- Generation Verification Gate;
- current Generation evidence filtering;
- Generated Claim scalar binding;
- persistence and current-manuscript integrity recheck;
- WordPress/Tistory Draft readiness consumption of shared verification state;
- common Bright Finance source/Snapshot/Gate combinations.

Still missing or incomplete:

- structured generated semantic representation for every high-risk Claim kind;
- deterministic end-to-end qualifier preservation after Generation;
- Claim-ID-owned Generation evidence bundle;
- schedule-specific changed-Claim integration regression;
- verified publishing execution artifact/ticket if required after call-site hardening;
- latest real Bright Finance Provider run.

## 12. Recommended Next Implementation Order

Do not add another AI call.

```text
V-04
Create Claim-ID-owned Generation evidence bundle
    ↓
V-03 / remaining V-02
Define structured generated factual-claim representation in the existing Generation response
    ↓
Rebind/Quality
Compare generated structured Claims against verified Claim semantics
    ↓
V-05
Add schedule changed-Claim integration regression
    ↓
V-06
Add verified publishing execution artifact only if call-site hardening requires it
    ↓
Live Bright Finance verification
Planning → real Source Preflight → Generation 1x → Quality Review 1x
```

## 13. Current Audit Conclusion

Accurate current status:

```text
Verification architecture: Implemented
Approval explicit Planning rollout: Implemented
All 9 Claim kinds source-normalized: Implemented and automated-regression verified
Money basis/comparator source semantics: Implemented and automated-regression verified
Bright Finance source/Snapshot/Gate Matrix: Implemented and automated-regression verified
Plan/Snapshot/Generation Gate/persistence/Quality/publishing linkage: Implemented
Generated semantic Claim re-verification for every high-risk kind: Incomplete
Claim-ID-owned Generation evidence bundle: Not implemented
Schedule changed-Claim integration regression: Missing
Latest real Bright Finance Provider run: Pending
External WordPress/Tistory write for this workstream: Not performed
```

Latest implementation verification:

```text
HEAD: fc2f9e5b5efdfed5e338cef2e7e697bc807ef634
GitHub Actions run: 31240664253
Job: 93060958310
Typecheck: passed
Lint: passed
Test: passed
Build: passed
```

No merge or Ready transition is authorized by this audit.