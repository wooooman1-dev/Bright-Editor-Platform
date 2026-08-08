# Verification Claim and Source Development Status

Last updated: 2026-08-08

## 1. Purpose

This is the current status record for Verification Claim, Source Preflight, Generated Claim verification and approval-content factual safety on Draft PR `#42`.

```text
Repository: woooooman1-dev/Bright-Editor-Platform
Base branch: fix/wordpress-full-audit
Feature branch: feat/data-source-multi-connections
Pull request: #42
Latest implementation HEAD verified by CI: 084f84b04832701021f3b81ca96b066df187fb45
GitHub Actions run: 31245532260
Job: 93073396332
Typecheck: passed
Lint: passed
Test: passed
Build: passed
```

No merge, Ready transition, public publishing or external WordPress/Tistory write is authorized by this status document.

## 2. Original Bright Finance Source Preflight Incident

The confirmed Bright Finance failure occurred on a new approval-preparation Content about comparing deposits and savings products.

The API-visible HTTP `400` was not an OpenAI HTTP 400. Bright Studio Source Preflight produced `APPROVAL_SOURCE_NOT_READY`, which the Studio API mapped to HTTP 400 before Generation.

A Planning line similar to:

```text
예금자보호 확인 콘텐츠와 연결되는 금융회사별 예금 합산 점검 필요성
```

was editorial/internal-link context. The legacy Claim derivation path treated the `예금자보호` reference as if deposit protection were the primary factual subject and activated unrelated mandatory Claims.

The confirmed false-positive scope is protected by:

```text
tests/unit/core/approval/BrightFinanceSourcePreflightRegression.test.ts
```

## 3. Corrected Planning and Claim Scope

Approval-preparation Content now automatically uses explicit Verification Planning from canonical approval-policy context.

The server keeps these concepts separate:

```text
expectedCoverage
= editorial scope

verificationClaims
= concrete externally verifiable factual Claims
```

Internal-link targets, generic quality requirements, boilerplate warnings and abstract mentions do not become mandatory factual Claims by themselves.

The explicit Planning Structured Output schema is strict-valid and malformed explicit Claim output is rejected rather than silently downgraded to legacy behavior.

## 4. Current Verification Claim Contract

Planning supports nine Claim kinds:

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

The explicit fetched-source normalization boundary now implements deterministic normalization for all nine kinds.

Canonical source-value comparison handles supported equivalent representations rather than requiring display strings to be identical. Covered examples include:

```text
50만원 == 500,000원
3% == 3퍼센트
2026-08-01 == 2026년 8월 1일
법 조문 spacing variants
```

An absent Verification Plan remains legacy-compatible. An explicit empty plan remains distinct and means factual Source Preflight is not required for that plan.

## 5. Money and Ratio Semantic Preservation

Money source normalization now preserves supported comparator and basis semantics.

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

Examples accepted when semantically equivalent:

```text
planned: 월 50만원
source: 500,000원
confirmed Claim context: monthly
→ equivalent normalized money Claim
```

Examples rejected when materially different:

```text
planned: 월 50만원
source: 연 500,000원
→ claim_raw_value_mismatch
```

Ratio source normalization preserves percent / percentage-point representation, comparator and the current canonical rate/share/change meaning where deterministically derivable from the confirmed Claim.

The canonical Generation evidence bundle now preserves these supported semantics before Generation. Generated surrounding qualifiers remain an open end-to-end item because the post-Generation binding layer is not yet a universal semantic representation.

## 6. New Source Handling

Source identity is not a hardcoded URL allowlist.

For a new public HTTPS URL the server can derive canonical source identity and institution grouping. Host variants such as `www`, mobile and AMP are grouped so multiple URLs from one institution do not count as independent institutions.

Redirects are validated and the safe final URL is used for source identity.

Invalid or unusable sources fail closed through diagnostics rather than authorizing the Claim or crashing unrelated source processing.

Typical controlled outcomes include:

- unsafe/malformed URL;
- unreachable page;
- unsupported document extraction;
- unofficial source;
- Claim evidence excerpt not found;
- Claim value not found;
- raw/normalized Claim mismatch;
- normalization failure;
- stale or unknown freshness.

A newly discovered source is not trusted merely because it is new or public. It must still satisfy source policy, page extraction, Claim support and freshness requirements.

## 7. Source Preflight and VerificationSnapshot

Current approval-content factual path:

```text
Confirmed explicit Verification Plan
→ Source discovery
→ URL/network safety
→ direct page fetch
→ redirect-final validation
→ document extraction
→ evidence excerpt verification
→ Claim value verification
→ typed normalization
→ temporal/freshness evaluation
→ institution/source policy
→ VerificationSnapshot
```

Generation does not start when a required Claim is insufficient, conflicted, stale or otherwise not verified.

Source Preflight rejection remains a controlled workflow state and must not create a manuscript or trigger publishing.

## 8. Generation Verification Gate and Claim-ID Evidence

Before the Generation provider call, the server:

- recomputes the Plan fingerprint;
- requires an explicit compatible VerificationSnapshot;
- recomputes Snapshot integrity;
- re-evaluates Claim policy;
- requires every required Claim to remain verified;
- filters Generation evidence to trusted supporting fresh assessments;
- binds each explicit Generation source projection back to the same verified `claimId`;
- validates the canonical Claim contract and source identity before prompt construction;
- requires every `gate.verifiedClaimId` to own at least one trusted canonical source projection.

The authoritative explicit Generation evidence is now Claim-ID owned and preserves:

```text
claimId
field
kind
statement
required
normalizedValue
qualifiers
temporalRequirement
trusted sources
```

The Generation prompt uses this canonical projection rather than the legacy field/value projection as factual authority. Same-field Claims are not merged merely because their display fields match.

The older `field/value/evidenceExcerpt` structure remains only as a compatibility projection for existing Approval Evidence metadata.

No extra AI call is added by this Gate or evidence projection.

Core implementation:

```text
core/approval/VerificationGenerationEvidence.ts
core/ai/VerificationGenerationBundle.ts
core/ai/ApprovalSourcePreflight.ts
```

## 9. Generated Claim Binding and Persistence

After Generation, deterministic Generated Claim Binding links supported generated factual tokens to verified Claim/source IDs.

Current unsupported-value detection is strongest for:

- money;
- ratios/percentages;
- dates;
- durations;
- legal article numbers.

The resulting server-owned verification record is persisted in canonical Content metadata with:

- VerificationSnapshot;
- current bindings;
- verified Claim IDs;
- detected unsupported count;
- bound editorial revision.

Client state cannot simply self-declare a factual Claim verified.

## 10. Quality Review Linkage

Quality re-evaluates the current canonical manuscript against the stored VerificationSnapshot and confirmed Plan.

When the current deterministic integrity contract detects an unsupported factual edit, Quality is forced to a blocked state even if an older revision previously passed.

No extra Quality AI call is added by this integrity check.

The earlier conceptual label `Phase 6 — Quality Review Claim Linkage` is not an unimplemented separate phase. The linkage itself is implemented. Its semantic coverage is constrained by the Generated Claim detector boundary described below.

## 11. Publishing Readiness Linkage

Source truth remains Core-common rather than WordPress-specific or Tistory-specific.

Confirmed current registered path:

```text
Core Planning / Verification / Generation / Quality
→ platform readiness
→ platform execution
```

Static audit confirmed:

- WordPress Draft Service calculates readiness before external Draft creation;
- Tistory Draft API asserts Generated Claim integrity before registered Playwright execution;
- Tistory schedule readiness inherits the general `generated_claim_verification` readiness check.

No public publishing capability was enabled by this work.

## 12. Bright Finance Verification Matrix

Offline regression coverage now includes:

```text
tests/unit/core/approval/BrightFinanceVerificationMatrix.test.ts
```

Covered finance-shaped scenarios:

1. 지원금 — money / eligibility / dateRange / location
2. 예금·적금 — ratio / duration / general
3. 세금·공제 — ratio / date / legal
4. 대출 — money / ratio / duration
5. changed planned money value fails closed
6. monthly planned amount does not equal explicitly annual source amount

The Matrix exercises:

```text
source assessment
→ typed normalization
→ freshness
→ VerificationSnapshot
→ Generation Gate
```

It uses fixture values, not current real policy amounts.

The Matrix found a real money-basis normalization gap during implementation. The Production normalizer was corrected rather than weakening the test.

It also confirmed that page-value verification rejects a source value that does not actually appear in the fetched page fixture.

## 13. Current Automated Verification

Latest implementation verification:

```text
HEAD: 084f84b04832701021f3b81ca96b066df187fb45
GitHub Actions run: 31245532260
Job: 93073396332
Typecheck: passed
Lint: passed
Test: passed
Build: passed
```

Automated coverage now verifies:

- approval explicit Planning activation;
- strict Planning schema;
- original Bright Finance false-positive regression;
- all nine source-normalization kinds;
- canonical equivalent source values;
- money basis semantics;
- dynamic source identity;
- temporal/freshness policy;
- VerificationSnapshot;
- Generation Gate;
- Claim-ID-owned Generation evidence and source ownership;
- same-field Claim identity separation;
- canonical normalized value and qualifier preservation in the Generation prompt;
- legacy-only explicit evidence fails closed;
- forged canonical Claim value projection is rejected;
- Bright Finance source/Snapshot/Gate combinations;
- Generated Claim scalar binding;
- canonical verification persistence;
- Quality blocking for detected unsupported edits;
- WordPress/Tistory readiness consumption of shared Verification state.

Automated fixture success does not prove the latest real external Bright Finance Provider run.

## 14. Remaining Architecture Work

The source-side nine-kind mismatch and Claim-ID Generation evidence ambiguity found by the static audit are resolved.

Remaining confirmed architecture items are:

1. **Generated semantic Claim representation**
   - preserve comparator, basis, subject, scope, eligibility/location/legal proposition meaning after Generation without another AI call.

2. **Non-scalar edit re-verification**
   - current token detector is not universal semantic extraction for eligibility, location and legal propositions.

3. **Tistory schedule changed-Claim integration regression**
   - current protection exists through readiness composition, but the full changed-Claim schedule fixture is still missing.

4. **Publishing execution defense in depth**
   - low-level Tistory execution services depend on the registered upstream readiness/API boundary. A platform-neutral verified execution artifact can be considered if call-site hardening requires it.

Authoritative detailed findings:

```text
Docs/current/04_DEVELOPMENT/08_VERIFICATION_ARCHITECTURE_AUDIT.md
```

## 15. Remaining Live Bright Finance Gate

The user local environment is still required for the final external verification:

```text
new Bright Finance Content
→ Planning 1 call
→ confirm explicit verificationPlan
→ inspect real Claims
→ Source Preflight
→ inspect real newly discovered source URLs and VerificationSnapshot
→ only if valid: Generation 1 call
→ Quality Review 1 call
→ inspect generated HTML and canonical verification metadata
```

Manual harness:

```text
tests/manual/bright-finance-source-live-verification.test.ts
```

The harness does not perform WordPress Draft save or public publishing.

## 16. Current Status

```text
Original Bright Finance false-positive Source Preflight bug: Fixed by automated regression
Approval explicit Verification Planning: Implemented
All 9 Claim kinds source-normalized: Implemented and automated-regression verified
Money basis/comparator source semantics: Implemented and automated-regression verified
New-source dynamic identity handling: Implemented and automated-regression verified
VerificationSnapshot / Generation Gate: Implemented
Claim-ID-owned Generation evidence bundle: Implemented and automated-regression verified
Generated Claim persistence / Quality linkage: Implemented
Bright Finance source/Snapshot/Gate Matrix: Implemented and automated-regression verified
Generated semantic re-verification for every high-risk proposition: Incomplete
Schedule changed-Claim integration regression: Missing
Latest Bright Finance live Provider run: Pending
WordPress/Tistory external write verification for this workstream: Not performed
```

## 17. Safety / Non-goals

This workstream does not authorize or claim:

- automatic public publishing;
- acceptance of every newly discovered website as trustworthy;
- arbitrary semantic fact extraction for all prose;
- bypassing source, freshness, conflict or Claim policy;
- another AI normalization/review call;
- WordPress-specific/Tistory-specific source truth systems;
- live verification without actual Provider and persisted local-state evidence.

The expected response to an unusable source or unsupported semantic Claim is controlled rejection/insufficient verification, not silent acceptance.