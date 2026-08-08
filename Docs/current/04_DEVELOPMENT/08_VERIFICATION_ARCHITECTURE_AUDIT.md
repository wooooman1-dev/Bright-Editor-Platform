# Verification Architecture Static Audit

Last updated: 2026-08-08

## 1. Purpose

This document records a static architecture audit of the Verification Claim, Source Preflight, Generated Claim Binding, Quality and publishing-readiness chain on Draft PR `#42`.

Audit basis:

```text
Repository: woooooman1-dev/Bright-Editor-Platform
Branch: feat/data-source-multi-connections
PR: #42
Audited ref: 052ddcb39c0d547d1e7780d6c48126fedf87f2d9
PR state at audit start: Open / Draft / Unmerged
```

This is a read-only architecture audit of actual repository code and existing automated tests. No production Provider call, local `.bright-studio` mutation, WordPress Draft write, Tistory Draft write or public publishing was performed.

This document does not declare the workstream complete. It identifies what is already protected and what still has contract gaps.

## 2. Audited Pipeline

The implemented verification pipeline is currently:

```text
Approval-aware Planning
→ explicit verificationPlan
→ Source Preflight
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

The audit checked the following implementation boundaries:

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
- `app/application/publishing/WordPressDraftReadiness.ts`
- `app/application/publishing/WordPressDraftApplicationService.ts`
- `app/application/publishing/TistoryPublishingPreparation.ts`
- `app/api/tistory/route.ts`
- `app/application/publishing/TistoryScheduleReadiness.ts`
- `app/api/publishing/schedules/create/route.ts`
- `app/application/publishing/TistoryScheduleCreateApplicationService.ts`

## 3. Verified Architecture Strengths

### 3.1 Explicit Planning is server-owned before Generation

Approval-aware Planning automatically enables explicit Verification Planning from canonical approval-policy context.

The Planning schema supports explicit Claim definitions before Generation and the server assigns deterministic Claim IDs and a Verification Plan fingerprint.

The plan is not inferred from generated prose after the fact.

### 3.2 Generation does not trust a stored status string

`VerificationGenerationGate` recomputes the plan fingerprint, verifies the Snapshot fingerprint, rejects unknown or duplicate result Claim IDs, re-evaluates Claim policy, and only exposes fresh supporting normalized assessments.

Required Claims that do not remain verified block Generation.

### 3.3 Generated verification state is server-owned

Generation creates canonical `generatedClaimVerification` metadata only after the Verification Generation Gate passes.

The stored record contains the `VerificationSnapshot`, current binding information and the editorial revision at which the binding was calculated.

### 3.4 Quality rechecks the current manuscript

Quality does not trust the old stored binding as sufficient authority.

`evaluateGeneratedClaimVerificationIntegrity()` re-evaluates the Generation Gate and re-runs deterministic Generated Claim Binding against the current canonical manuscript.

A changed unsupported detected scalar can therefore block the current Quality result even when an older revision was approved.

### 3.5 WordPress Draft execution is gated before external write

`WordPressDraftApplicationService.execute()` calls its own `prepare()` path before any external Draft creation. `prepare()` calculates `WordPressDraftReadiness`, which includes `generated_claim_verification`.

External media and Draft operations are not reached when readiness is not executable.

### 3.6 Tistory Draft execution has an explicit route-level verification assertion

`app/api/tistory/route.ts` calls `assertGeneratedClaimVerificationIntegrity()` before the Tistory Draft Application Service is allowed to execute the registered Playwright workflow.

The route also rechecks stored Quality, calculates current rule Quality, and asserts approval-article integrity.

### 3.7 Tistory scheduling currently inherits the shared Claim Gate

`calculateTistoryScheduleReadiness()` calls `calculateTistoryReadiness()` and removes only the draft-specific Permission Gate and final-confirmation checks before adding schedule-specific checks.

Because `calculateTistoryReadiness()` currently contains `generated_claim_verification`, schedule readiness also inherits that check.

The registered schedule-create route requires `readiness.executable === true` before reservation and Playwright execution.

This means scheduling is currently protected indirectly even though the original Phase 5D implementation scope did not add a separate schedule-specific Generated Claim Gate.

## 4. Finding V-01 — Planning Supports 9 Claim Kinds, Explicit Source Normalization Handles Only 3

Severity: **P1 — correctness / availability blocker before broad live rollout**

Confirmed code contract:

```text
Planning VerificationClaimKind:
- money
- ratio
- date
- dateRange
- duration
- location
- eligibility
- legal
- general
```

However, `assessmentsFromExplicitDiscovery()` currently normalizes discovered source values through `normalizeExplicitScalar()`, whose implemented branches are only:

```text
- general
- money
- ratio
```

For the other Planning-supported kinds, normalization returns `undefined`:

```text
- date
- dateRange
- duration
- location
- eligibility
- legal
```

The support condition requires a normalized value. Therefore a required Claim of one of these kinds can receive a real fetched official page and still fail with `claim_normalization_failed`.

The current explicit Source Preflight integration tests are concentrated on money Claims and do not protect all nine Planning-supported kinds.

### Impact

This is fail-closed rather than fail-open: unsupported normalization tends to block Generation instead of silently authorizing the Claim.

That protects against publishing an unverified required Claim, but it can create false `APPROVAL_SOURCE_NOT_READY` failures for valid approval content whose Planning contains dates, eligibility, legal provisions, locations or durations.

### Required correction

Create one deterministic source-value normalization contract that supports every `VerificationClaimKind` allowed by Planning.

Do not add an AI normalization call.

The same normalization semantics must be reused by:

- explicit Source Preflight;
- Snapshot creation;
- Generation Gate recheck;
- Generated Claim equivalent-value matching where applicable.

## 5. Finding V-02 — Current Money and Ratio Normalization Loses Important Claim Semantics

Severity: **P1 — factual integrity gap**

The typed canonical contracts support richer semantics:

Money can contain:

- comparator;
- basis such as one-time, daily, monthly, annual, total, per-person or per-household;
- tax inclusion.

Ratio can contain:

- comparator;
- representation;
- meaning such as rate, share or change.

The current explicit source-text normalizer does not derive those semantics.

For money it currently creates a normalized value equivalent to:

```text
amount + currency + basis: total
```

For a percent ratio it currently creates a normalized value equivalent to:

```text
value + representation: percent + meaning: rate
```

It does not deterministically compare the Planning Claim qualifiers or statement semantics against those normalized fields.

### Example risk

A Claim whose editorial meaning is "월 50만원" and a generated statement whose meaning becomes "연 50만원" can share the same scalar token `50만원`.

Likewise, a Claim about an upper limit can share the same scalar value with a generated statement that changes the comparator.

The current scalar binder is value-token based and cannot by itself prove that the surrounding basis/comparator meaning is unchanged.

### Required correction

The source-value normalizer and generated-value matcher must preserve and compare semantic qualifiers that materially change the factual proposition.

At minimum, normalized source verification must deterministically account for the applicable:

- comparator;
- basis;
- ratio meaning;
- subject/scope qualifiers when they change the proposition.

## 6. Finding V-03 — Generated Claim Detection is Intentionally Partial but the High-Risk Policy is Broader

Severity: **P1 — guarantee boundary must be closed or explicitly constrained**

`VerificationClaimPolicy` treats the following as high-risk:

```text
money
ratio
date
dateRange
location
eligibility
legal
```

`GeneratedClaimBinding` currently has deterministic unsupported-value detection for:

```text
money
ratio
date
duration
legal article numbers
```

It does not provide general semantic unsupported-value detection for:

```text
location
eligibility
legal proposition semantics
general free-form propositions
```

The development status document already states that the detector is not universal semantic fact extraction. The static audit confirms that this is a real implementation boundary, not only conservative wording.

### Impact

A generated unsupported money/date scalar is likely to be surfaced as `unverifiedDetected`.

A generated semantically different eligibility rule or location proposition may not be surfaced when it does not contain a separately detectable unsupported scalar.

### Required correction options

One of the following must be made explicit before broad approval-content rollout:

1. implement deterministic canonical representations for every high-risk kind and require generated claims to emit those representations; or
2. narrow the guaranteed high-risk Claim kinds to those that the deterministic binder can actually re-verify; or
3. introduce a structured generated factual-claim section inside the existing Generation response schema so the server can compare generated propositions to the verified Plan without adding another AI call.

Option 3 best matches the project's cost rule because it can reuse the existing single Generation call.

## 7. Finding V-04 — Explicit Generation Bundle Downgrades Claim Identity to Legacy Field/Value Projection

Severity: **P2 — architecture ambiguity / future regression risk**

The canonical explicit verification model is Claim-ID based.

However, the Generation prompt compatibility bundle currently projects verified Claim evidence into the legacy shape:

```text
field
value
evidenceExcerpt
```

It does not carry the canonical:

- `claimId`;
- Claim statement;
- qualifiers;
- temporal requirement.

The repository already supports two different Claims with the same field while keeping their Claim IDs separate. The compatibility projection can therefore lose information that distinguishes those Claims when constructing the Generation evidence prompt.

`requireExplicitVerificationGenerationBundle()` also checks that the filtered source and Claim-source arrays are non-empty globally when verified Claims exist, rather than asserting a complete Claim-ID-to-source projection for every verified Claim.

### Required correction

Create an explicit Generation evidence bundle whose primary identity is `claimId` rather than the legacy field-only compatibility type.

For every `gate.verifiedClaimId`, require at least one trusted source projection containing the matching `claimId`, normalized verified value and the semantic qualifiers needed to preserve the factual proposition.

Legacy field/value projection may remain only at a compatibility boundary where it cannot authorize Generation by itself.

## 8. Finding V-05 — Schedule Inheritance is Real but Not Regression-Protected as a Verification Integration

Severity: **P2 — regression coverage gap**

Current code behavior is safe through composition:

```text
TistoryScheduleReadiness
→ calculateTistoryReadiness
→ generated_claim_verification
```

However, `TistoryScheduleReadiness.test.ts` mocks `calculateTistoryReadiness()` and therefore does not prove that an actual changed Generated Claim causes schedule readiness to fail.

The current Generated Claim publishing integration tests cover WordPress and normal Tistory readiness, not the schedule-create route with a real verification record.

### Required correction

Add a deterministic schedule regression fixture:

```text
verified 50만원
→ canonical manuscript edited to 70만원
→ old Quality kept deliberately current-looking in fixture
→ schedule readiness must expose generated_claim_verification=false
→ schedule create route must not reserve or execute Playwright
```

No external Tistory call is needed for this regression test.

## 9. Finding V-06 — Tistory Execution Services Rely on Registered Upstream Readiness for Canonical Verification

Severity: **P2 — defense-in-depth boundary**

Normal Tistory Draft and schedule routes protect the registered product path before external execution.

The low-level `TistoryDraftApplicationService` and `TistoryScheduleCreateApplicationService` themselves do not own the full canonical Opportunity / Verification / Quality context. They mainly enforce publishing target, platform, Permission Gate, session and worker-specific execution constraints.

A future internal caller that bypasses the registered API/readiness boundary could therefore invoke those services without the same canonical Verification check.

No current public registered route bypass was found in this audit.

### Required correction

Do not add duplicate verification logic into platform-specific workers.

Instead, define one platform-neutral verified publishing execution ticket or readiness artifact produced only after canonical Core checks pass. Tistory execution services should require that server-owned ticket in addition to Permission Gate authorization.

This keeps Core truth shared while preventing future internal call sites from accidentally bypassing readiness composition.

## 10. Test Coverage Audit

### Existing strong coverage

Existing tests directly cover:

- Planning strict explicit schema;
- explicit plan persistence;
- money Claim Source Preflight;
- source identity and institution grouping;
- temporal policy;
- Snapshot fingerprinting;
- Generation Verification Gate;
- filtered Generation evidence bundle;
- generated money value binding;
- changed unsupported money detection;
- canonical verification persistence;
- Quality blocking after an unsupported scalar edit;
- WordPress Draft readiness;
- Tistory Draft readiness;
- route-level approval Planning activation.

### Missing matrix confirmed by this audit

The repository does not currently have one end-to-end deterministic matrix covering all Planning-supported Claim kinds through:

```text
Planning Claim
→ explicit source text normalization
→ source assessment
→ VerificationSnapshot
→ Generation Gate
→ Generation bundle
→ Generated Claim binding
→ Quality integrity
→ Draft/schedule readiness
```

The next regression matrix should include at least:

| Kind | Source normalization | Generated equivalent | Unsupported edit | Quality block | Draft block | Schedule block |
|---|---|---|---|---|---|---|
| money | required | required | required | required | required | required |
| ratio | required | required | required | required | required | required |
| date | missing today | required | required | required | required | required |
| dateRange | missing today | required | required | required | required | required |
| duration | missing today | required | required | required | required | required |
| location | missing today | semantic design required | semantic design required | required | required | required |
| eligibility | missing today | semantic design required | semantic design required | required | required | required |
| legal | missing today | partial article-number support only | semantic design required | required | required | required |
| general | source normalization exists | semantic guarantee limited | semantic guarantee limited | policy-dependent | policy-dependent | policy-dependent |

## 11. Recommended Implementation Order

Do not add another AI call.

Recommended next implementation sequence:

```text
V-01
Complete deterministic source normalization for all Planning-supported Claim kinds
    ↓
V-02
Preserve comparator / basis / meaning / material qualifiers
    ↓
V-04
Replace field-only Generation compatibility projection with claimId-owned explicit bundle
    ↓
V-03
Define structured generated factual-claim representation inside the existing Generation response
    ↓
V-05
Add full claim-kind and schedule regression matrix
    ↓
V-06
Add server-owned verified publishing execution ticket / artifact if needed after call-site audit
```

The order is deliberate. Expanding tests before the canonical normalization and explicit Generation bundle contracts are corrected would lock in incomplete semantics.

## 12. Current Audit Conclusion

The repository has a real shared Verification architecture and the currently registered WordPress/Tistory Draft paths are not missing the Generated Claim Gate.

However, the workstream must not yet be described as semantically complete for all declared `VerificationClaimKind` values.

Current accurate status:

```text
Verification architecture skeleton: Implemented
Plan/Snapshot/Gate/persistence/publishing linkage: Implemented
Current money-focused automated path: Verified by existing fixtures
All 9 Claim kinds source-normalized end-to-end: Not implemented
Semantic qualifier preservation: Incomplete
Non-scalar generated Claim re-verification: Incomplete
Schedule Generated Claim integration regression: Missing
Latest real Bright Finance Provider run: Pending
External WordPress/Tistory write for this workstream: Not performed
```

No merge or Ready transition is authorized by this audit.