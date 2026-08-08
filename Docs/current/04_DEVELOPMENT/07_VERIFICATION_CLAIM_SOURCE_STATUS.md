# Verification Claim and Source Development Status

Last updated: 2026-08-08

## 1. Purpose

This document is the current implementation-status record for the Verification Claim, Source Preflight, Generated Claim verification and related approval-content safety work on Draft PR `#42`.

It exists because the older Roadmap and Current Development Status documents predate the Source Preflight incident and the subsequent Verification Claim implementation. Historical Sprint and Stage documents remain valid for their original scope, but this document is the authoritative status record for this verification workstream until those higher-level documents are synchronized.

```text
Repository: woooooman1-dev/Bright-Editor-Platform
Base branch: fix/wordpress-full-audit
Feature branch: feat/data-source-multi-connections
Pull request: #42
PR state: Open / Draft / Unmerged
Implementation verification baseline: 88efad926c49b1f7ab3bcd011ad7562ffb98122a
Documentation validation baseline before the static audit: 052ddcb39c0d547d1e7780d6c48126fedf87f2d9
```

No merge, Ready-for-review transition, public publishing or external WordPress/Tistory write is authorized by this status document.

## 2. Original Bright Finance Source Preflight Incident

The real failure was reproduced from a new `밝은재테크` approval-preparation Content whose topic was a comparison of deposits and savings products.

The API-visible HTTP `400` was not an OpenAI HTTP 400. Bright Studio's Approval Source Preflight rejected the request with `APPROVAL_SOURCE_NOT_READY`, and the Studio API mapped that workflow rejection to HTTP 400 before manuscript Generation.

The confirmed false-positive scope included Planning text similar to:

```text
예금자보호 확인 콘텐츠와 연결되는 금융회사별 예금 합산 점검 필요성
```

That sentence was editorial/internal-link context. The legacy Claim derivation path treated the `예금자보호` mention as if deposit protection were the primary factual subject of the article and activated a full specialized deposit-protection Claim bundle. Conceptual interest-rate language could also activate generic scalar Claims without a concrete planned value.

The resulting Source Preflight attempted to prove facts that the current manuscript did not actually require and blocked Generation when those unrelated Claims were not fully covered.

## 3. Corrected Claim Scope Contract

Required factual Claims are now scoped from the confirmed primary topic rather than from every phrase stored in Planning.

Primary-topic scope includes:

- source request;
- selected topic;
- primary and secondary keywords;
- search intent;
- content angle;
- reader problem.

The following do not activate a full specialized Claim bundle by themselves:

- an internal-link target or related-content reference;
- a generic quality requirement;
- a boilerplate warning or exception label;
- a conceptual mention with no concrete factual value.

Generic scalar Claims such as amount, interest rate, period, tax rate, eligibility, exceptions and statutory basis require a concrete Planning value before they become mandatory preflight Claims.

When the scoped confirmed Opportunity has no required factual Claims, Source Preflight returns `not_required` and does not spend a Source Preflight discovery call.

A regression test using the actual Bright Finance failure shape protects this boundary:

```text
tests/unit/core/approval/BrightFinanceSourcePreflightRegression.test.ts
```

## 4. Explicit Verification Planning

Approval-preparation Content now uses explicit Verification Planning instead of relying on legacy post-hoc Claim inference.

For canonical approval context, Planning produces a versioned explicit `verificationPlan` containing Claim definitions before Generation.

The rollout no longer depends solely on a local environment flag for approval content. Canonical approval policy context causes the Planning Strategy to select explicit Verification Planning automatically.

Standard and legacy non-approval content remain compatible with the prior path.

### Strict Structured Output correction

Before automatic approval-content rollout, the explicit Planning JSON Schema was corrected to satisfy OpenAI strict Structured Outputs requirements:

- all object properties are represented in `required`;
- optional semantic values are represented by deterministic empty values and normalized by the server parser;
- nested Claim qualifiers and temporal fields have complete strict schemas;
- malformed explicit Claim output is rejected rather than silently downgraded to legacy behavior.

This prevents enabling explicit Planning from introducing a new Provider-side schema 400.

## 5. Verification Claim Contracts

Implemented Core contracts include:

- `VerificationClaim`;
- deterministic Claim IDs and fingerprints;
- normalized Claim values;
- temporal requirements;
- temporal evidence;
- source identity;
- source assessments;
- Claim results;
- `VerificationSnapshot`;
- explicit Verification Plan persistence on Content Opportunity.

An absent plan remains legacy-compatible. An explicit empty plan is distinct from an absent plan.

Invalid explicit plans do not silently downgrade to legacy behavior.

The type system declares nine `VerificationClaimKind` values, but the current live explicit source-text normalization path does not yet implement all nine kinds. The exact gap is recorded in `08_VERIFICATION_ARCHITECTURE_AUDIT.md` and must be resolved before this workstream is described as semantically complete.

## 6. Source Identity and New Source Handling

Source identity is not implemented as a closed list of exact URLs.

For a new public HTTPS URL, the server can deterministically derive canonical source identity and institution grouping. Common host variants such as `www`, mobile and AMP forms are normalized so multiple URLs from one institution are not counted as independent institutions.

Redirect verification records and evaluates the safe final URL.

Unknown, invalid or unusable sources are not allowed to crash or authorize the entire source set. They are evaluated and can be rejected with diagnostics such as:

- unsafe or malformed URL;
- unreachable source;
- unsupported content type;
- unofficial source;
- unsupported Claim;
- Claim/value mismatch;
- stale or unknown freshness.

A newly discovered source is accepted only from its submitted Claim data plus the actual fetched page content. A hardcoded known URL-to-Claim mapping is not required for a new official URL.

Regression coverage includes dynamic identity creation for previously unseen public HTTPS domains, host-variant institution grouping, independent institutions and redirect-final identity behavior.

## 7. Source Preflight and VerificationSnapshot

For approval-preparation structured long-form content with required Claims:

```text
Confirmed explicit Verification Plan
→ Source Preflight discovery
→ public HTTPS and network-boundary validation
→ direct source fetch
→ final redirect URL validation
→ supported text extraction
→ source-level evidence excerpt verification
→ Claim field/value/excerpt verification
→ normalization
→ temporal/freshness evaluation
→ complete Claim coverage
→ VerificationSnapshot
```

Generation is not called when a required Claim remains uncovered, conflicted, stale under policy, otherwise not verified, or unsupported by the currently implemented deterministic normalizer.

Source Preflight failure is a controlled workflow state. It must not create a manuscript or trigger publishing.

## 8. Generation Verification Gate

The Generation Verification Gate is implemented.

Before the Generation provider call, the server:

- recomputes the explicit Verification Plan fingerprint;
- requires a compatible VerificationSnapshot;
- recomputes the snapshot fingerprint;
- requires all required Claims to be verified;
- re-evaluates Claim policy rather than trusting a stored status string;
- excludes optional nonverified Claims from the Generation bundle;
- passes only supporting, fresh, normalized verified source data to Generation.

The blocked path uses the existing approval-source-not-ready failure contract.

No extra AI call is added by this Gate.

The static audit found that the explicit Generation prompt still uses a legacy field/value compatibility projection rather than preserving the full canonical Claim-ID semantics. This is an open architecture item, not a completed guarantee.

## 9. Generated Claim Binding

Generated Claim Binding is implemented as deterministic server logic after Generation.

The server scans publishable generated content and binds supported generated facts to verified Claim IDs and trusted source IDs.

Current deterministic high-risk scalar detection covers:

- money;
- ratios/percentages;
- dates;
- durations;
- legal article numbers.

Equivalent normalized representations can bind to the same Claim, for example a verified KRW amount represented as raw won or an exact `만원` form.

Unsupported detected high-risk scalar values are recorded as `unverifiedDetected` diagnostics rather than being labeled verified by the AI.

This detector is intentionally not described as universal semantic fact extraction. Arbitrary unstructured facts that have no deterministic representation are outside the guarantee of the scalar detector.

The static audit also confirmed that current money/ratio binding can preserve the scalar while missing a changed comparator, basis or other proposition-changing qualifier. That semantic gap is open and must not be described as fully verified factual equivalence.

## 10. Canonical Persistence and Edit Safety

Verification state is persisted as server-owned canonical Content metadata.

The persisted record includes:

- the VerificationSnapshot;
- Generated Claim bindings;
- the editorial revision at which the bindings were calculated.

Client snapshot writes cannot delete or replace the server-owned verification record.

Stored bindings are not trusted blindly after an edit. Quality verification evaluates the current manuscript against the persisted Snapshot and confirmed Verification Plan.

Therefore a manuscript that originally used a verified value but is later changed to an unsupported detected high-risk value cannot retain approval from an older binding.

This guarantee is limited to facts the current deterministic binding layer can actually detect and compare. It is not a universal semantic comparison guarantee.

## 11. Quality Review Linkage

The current Quality Engine applies deterministic Generated Claim verification in addition to the normal editorial Quality review.

When the current manuscript violates the persisted verification state in a way detected by the current binding/integrity contract, the Quality result is forced to:

```text
approved: false
approvalType: none
approvalState: blocked
```

The Quality report adds blocking findings/tasks instructing the workflow to remove the unsupported fact or restore a verified Claim value.

This deterministic check does not add another Quality AI call.

The prior conceptual plan sometimes referred to a separate "Phase 6 — Quality Review Claim Linkage". In the actual repository, that integration responsibility exists inside the current persistence/Quality path and is not an outstanding separate code phase. Its semantic coverage is still constrained by the open normalization and Generated Claim findings in the static audit.

## 12. Publishing Readiness Linkage

Publishing readiness consumes the shared Core verification result. Source verification is not implemented separately for WordPress and Tistory.

The shared rule is:

```text
Core Planning / Verification / Generation / Quality
→ platform publishing readiness
→ platform adapter only after shared gates pass
```

WordPress/Tistory may differ in transport, category, media and rendering details, but they must not have separate factual-source truth systems.

A stored historical Quality approval is insufficient if the current manuscript no longer matches its verified Claim state under the current deterministic integrity contract.

The static audit confirmed:

- WordPress Draft execution calculates readiness inside its Application Service before external Draft creation;
- normal Tistory Draft execution asserts Generated Claim integrity at the registered API boundary before Playwright execution;
- Tistory schedule readiness currently inherits the general Tistory `generated_claim_verification` check before schedule reservation/execution.

No public publishing capability was enabled by this work.

## 13. AI Call and Cost Contract

Approval-preparation content uses:

- Source Preflight: `0` calls when no scoped factual Claim requires source discovery; otherwise `1` small discovery call;
- Generation: `1` major call;
- Quality Review: `1` major call;
- Claim normalization, URL verification, source identity, fingerprinting, binding, edit integrity and publishing readiness: deterministic server logic, no additional AI call.

The project rule of avoiding unnecessary AI calls remains intact.

The recommended corrections in the static audit do not require another AI review call. Any structured generated factual-claim representation should be returned inside the existing Generation response rather than through a new agent or retry.

## 14. Automated Verification

Implementation verification baseline:

```text
HEAD: 88efad926c49b1f7ab3bcd011ad7562ffb98122a
GitHub Actions run: 31235886063
Conclusion: success

Typecheck: passed
Lint: passed
Test: passed
Build: passed

Test Files: 292 passed | 8 skipped
Tests: 1629 passed | 20 skipped
```

The subsequent documentation-only synchronization at `052ddcb39c0d547d1e7780d6c48126fedf87f2d9` also passed Typecheck, Lint, the full automated Test suite and Build with the same `292 passed | 8 skipped` files and `1629 passed | 20 skipped` tests.

Relevant regression coverage includes:

- explicit Verification Planning contract and automatic approval-context rollout;
- strict Planning schema structure;
- Bright Finance Source Preflight false-positive regression;
- money-focused explicit Source Preflight integration;
- Claim fingerprints;
- temporal policy;
- dynamic source identity;
- Generation Verification Gate;
- Generation verified bundle;
- Generated Claim Binding for current deterministic scalar fixtures;
- canonical verification persistence;
- Quality blocking after a detected unsupported factual edit;
- WordPress/Tistory publishing readiness consumption of the shared verification state;
- route-level Studio approval Planning using explicit Verification Planning.

The static architecture audit confirmed that this suite does not yet provide an end-to-end matrix for all nine Planning-supported Claim kinds or a real schedule Generated Claim regression fixture.

Automated verification proves repository behavior under the covered fixtures. It does not prove unimplemented semantic coverage and does not prove the live external Provider path for the latest Bright Finance content.

## 15. Remaining External Verification Gate

The live Bright Finance verification remains pending, but the static audit found deterministic architecture gaps that should be resolved before treating one successful live run as evidence of complete Claim coverage.

The eventual live sequence remains:

```text
new Bright Finance Content
→ Planning 1 call
→ confirm verificationPlan.mode = explicit
→ inspect scoped Claims and their kinds
→ Source Preflight
→ inspect real newly discovered source URLs and VerificationSnapshot
→ only when the plan/snapshot are valid: Generation 1 call
→ Quality Review 1 call
→ inspect generated HTML and verification metadata
```

A manual harness exists for this purpose:

```text
tests/manual/bright-finance-source-live-verification.test.ts
```

The harness does not perform WordPress Draft save or public publishing.

The current status statement is corrected to:

```text
Verification architecture skeleton: Implemented
Plan/Snapshot/Gate/persistence/publishing linkage: Implemented
Covered automated regression paths: Verified
All 9 Claim kinds normalized end-to-end: Not implemented
Semantic qualifier preservation: Incomplete
Non-scalar Generated Claim re-verification: Incomplete
Latest Bright Finance live Provider run: Pending
WordPress/Tistory external write verification for this workstream: Not performed
```

## 16. Non-goals and Safety

This workstream does not authorize or claim completion of:

- automatic public publishing;
- arbitrary semantic fact extraction for every possible prose Claim;
- acceptance of every newly discovered website as trustworthy;
- bypassing official-source, freshness, support or conflict policy;
- additional AI retry loops;
- WordPress-specific or Tistory-specific source truth systems;
- external verification without actual Provider and local persisted-state evidence.

The expected behavior for an unusable or currently unsupported Claim/source combination is controlled rejection or insufficient verification, not silent acceptance and not an unrelated application crash.

## 17. Static Architecture Audit Correction

A repository-level static audit was completed after the original status text above was written.

The authoritative finding record is:

```text
Docs/current/04_DEVELOPMENT/08_VERIFICATION_ARCHITECTURE_AUDIT.md
```

That audit supersedes any earlier wording in this document that could be read as saying all declared Verification Claim semantics are complete.

Confirmed open items are:

1. Planning can declare nine Claim kinds while explicit source-text normalization currently handles only money, ratio and general.
2. Current money/ratio source normalization and generated-value binding do not preserve every proposition-changing comparator/basis/meaning qualifier.
3. Generated Claim unsupported-value detection is scalar-focused and is not complete semantic re-verification for location, eligibility or legal propositions.
4. The explicit Generation bundle still projects verified Claim evidence through a legacy field/value shape that drops canonical Claim-ID semantics.
5. Tistory scheduling inherits the current verification Gate by composition, but the schedule-specific Generated Claim regression is not present.
6. Tistory execution services rely on their registered upstream readiness/API boundary for canonical Verification state and should not become independently callable publishing entry points without a server-owned verified execution artifact.

No production code was changed as part of this static audit.