# Approval Source Preflight

## Claim Risk Applicability (v2)

Evidence applicability is Claim-based, not article-wide and not inferred from
the approval profile alone. Source trust is also route-based rather than
official-domain-only.

- `NONE`: editorial advice, observation guidance, and checklists. Evidence is
  N/A.
- `VERIFY`: a generally verifiable statement. Verification is preferred, but a
  failed verification removes or generalizes that statement; it does not block
  manuscript Generation.
- `CRITICAL`: money, dates, eligibility, legal or tax rules, actual rates, and
  official conditions. Evidence is mandatory. Complete Evidence Coverage means
  complete coverage of these Claims only.

When no CRITICAL Claim applies, Source Preflight makes no provider call and
Generation may continue with an N/A Evidence state. A CRITICAL Claim that is
not verified is removed when the remaining article still satisfies the search
intent; otherwise Generation is blocked. An approval profile defines the
quality of the authoritative primary source for a Claim. It does not make a
source mandatory for every article. Information-as-of dates are required only
for time-sensitive CRITICAL Claims.

## Claim-context Source Authority

Authoritative primary-source status is determined from the owner of the Claim,
not from government-domain membership alone.

- law and legal requirements use the official law source or responsible
  government authority;
- tax Claims use the tax authority, applicable law, or responsible authority;
- government support and application conditions use the public body that
  actually administers the program;
- financial regulation and system Claims use the responsible regulator or
  official institution;
- a named bank, card issuer, insurer, or other entity's product rate, fee,
  cancellation condition, disclosure, description, or terms use that same
  entity's first-party official page or official document.

The existing profile allowlist remains authoritative for government-owned
Claims. Entity-owned product Claims are not required to use a government domain,
but they must pass all of the following independently:

1. Claim subject/entity and observed source owner match;
2. HTTPS;
3. an owner-bound official domain or formal first-party official document;
4. HTTP 2xx and successful non-empty extraction.

For an authoritative source, these source-readiness checks are sufficient for
every explicitly linked Claim. Evidence anchoring, semantic support,
normalized-value comparison, freshness, temporal checks, and corroboration are
diagnostics only and cannot reject that Claim. A non-authoritative source still
requires Claim relevance, exact `evidenceExcerptMatches()` anchoring, semantic,
temporal, freshness, and complete CRITICAL Claim Coverage verification.

Authority and relevance are separate decisions. A first-party page from another
entity fails source-owner authority. A first-party page from the correct entity
still fails when it does not address the Claim. Search snippets, secondary
articles, copied documents, and self-declared sources without the owner match do
not become official Evidence.

## Purpose

Approval-preparation content must not treat a source as trusted merely because
it has a URL. Bright Studio must fetch the cited page and confirm material
content relevance. An accepted official/first-party source may satisfy that
trust route alone; a non-official source requires independent corroboration of
the same material Claim. Information dates and reader-visible review dates are
optional diagnostics, not approval blockers.

A URL alone is not sufficient. The server must independently confirm authority,
successful HTTP fetch, and non-empty extraction. Those are the complete
acceptance conditions for a linked Claim from an authoritative source. A
non-authoritative source must materially support the cited content.
Unsupported or conflicting high-risk Claims remain blocking diagnostics for
non-authoritative sources.

This policy prevents the system from spending a full Generation call on a manuscript whose factual basis is incomplete, inaccessible, fabricated, mismatched, or outside the active official-source profile.

## Scope

The preflight applies only when all of the following are true:

- the Content uses an AdSense approval-preparation profile;
- a confirmed Content Opportunity exists;
- the production structured long-form Generation path is used.

Standard content and legacy non-structured calls remain unchanged.

## Explicit Verification Planning Input

Approval-preparation Planning uses an explicit Verification Plan as the preferred factual-input contract.

The confirmed Content Opportunity may persist:

```text
verificationPlan
├── schemaVersion
├── mode: explicit
├── claims[]
│   ├── deterministic claimId
│   ├── field
│   ├── kind
│   ├── statement
│   ├── optional normalized/raw value inputs
│   ├── qualifiers
│   ├── temporalRequirement
│   ├── required
│   └── optional policyId
└── fingerprint
```

For canonical approval-policy context, Bright Studio enables explicit Verification Planning automatically. The approval path must not depend solely on a developer-local feature flag.

The Planning provider response uses a strict Structured Output schema. All object fields are represented in the strict required-field contract, while semantically optional values use deterministic empty representations that are normalized by the server parser. Malformed explicit Claim output is rejected rather than silently downgraded to legacy behavior.

An explicit empty Claim list is valid and is distinct from an absent legacy plan. If the scoped confirmed topic requires no factual Source Preflight Claim, the workflow may skip Source Preflight without inventing a placeholder Claim.

Legacy Claim derivation remains a compatibility path. It must not override or broaden a valid explicit Verification Plan.

## Claim Scope Boundary

Required Claims are derived from the factual scope of the primary topic, not from every phrase stored in Planning.

Primary-topic scope includes:

- source request;
- selected topic;
- primary and secondary keywords;
- search intent;
- content angle;
- reader problem.

A specialized Claim bundle such as deposit protection, retirement pay, revolving credit, or continuing-transaction law is activated only when that subject is part of the primary-topic scope or Planning contains a concrete verified value for the Claim.

The following must not activate a full specialized Claim bundle by themselves:

- an internal-link target or related-content reference;
- a generic quality requirement;
- a boilerplate warning or exception label;
- a conceptual mention that contains no concrete factual value.

Generic scalar Claims such as amount, interest rate, period, eligibility, tax rate, exceptions, and statutory basis require a concrete Planning value before they become mandatory preflight Claims. Specialized topic Claims may still be discovered without a planned value when the specialized subject is the confirmed primary topic.

When scoped Planning produces no required factual Claims, Bright Studio returns `not_required` and skips the Source Preflight AI discovery call. Generation remains responsible for omitting unsupported external factual values, and deterministic post-Generation verification remains enabled.

Internal-link strategy remains editorial navigation context. Mentioning a verified related article does not make every factual Claim from that related article mandatory for the current manuscript.

## Required Workflow

```text
Confirmed Content Opportunity
→ explicit Verification Plan when approval context applies
→ required factual Claim derivation
→ primary-topic Claim scope
→ official source discovery when Claims remain
→ actual web-search URL membership check
→ URL safety and official-source policy
→ direct page fetch
→ redirect final URL recording
→ supported text extraction
→ source-level evidence excerpt match for non-authoritative sources
→ Claim field/value/evidenceExcerpt verification for non-authoritative sources
→ normalized date/amount/ratio/duration/unit comparison for non-authoritative sources
→ temporal/freshness policy for non-authoritative sources
→ complete Claim Coverage Gate
→ VerificationSnapshot
→ Generation Verification Gate
→ manuscript Generation 1 call
→ Generated Claim Binding
→ deterministic current-manuscript Claim verification
→ Quality Review 1 call
```

Source discovery is a small dedicated AI call. It must not write, outline, or revise the article.

## Source and Claim Response Contract

Each proposed source must use this structure:

```json
{
  "sources": [
    {
      "url": "https://official.example/page",
      "title": "Official page title",
      "evidenceExcerpt": "Verbatim source-level passage",
      "claims": [
        {
          "field": "Planning Claim field",
          "value": "Exact factual value",
          "evidenceExcerpt": "Verbatim passage from the same fetched page"
        }
      ]
    }
  ]
}
```

The source-level `evidenceExcerpt` proves that the direct page is relevant. Each Claim separately requires:

- a field required by confirmed Planning;
- a non-empty value;
- a non-empty Claim evidence excerpt;
- an excerpt that exists in the fetched final page;
- a value that exists in or is deterministically normalized from the fetched page context;
- exact agreement for dates, money amounts, percentages, durations, and units;
- semantic agreement with the shared Claim policy.

Known URL-to-Claim mappings are optional diagnostics. They do not authorize a Claim and are not required for a newly discovered official URL. A new official URL passes only from its actual submitted Claim data and fetched page content.

## Source Identity and New Sources

Source handling is not a closed exact-URL allow-list.

A previously unseen public HTTPS URL can receive deterministic canonical source identity and institution grouping. Common host variants such as `www`, mobile and AMP forms are normalized so several pages from one institution are not counted as independent institutions merely because the host spelling differs.

Redirect handling evaluates the safe final URL. A newly discovered source still must pass the active official-source profile, source-content, Claim-support, temporal and freshness rules before it may enter the verified Generation bundle.

An unusable new source should produce a controlled rejection/insufficient result, not silent authorization and not an unrelated application crash.

## Source Readiness Gate

A source may enter the Generation bundle only when all checks pass:

1. The URL was returned by the attached web-search tool in the same preflight response.
2. The URL is a public HTTPS URL and passes the shared network-boundary policy.
3. Every redirect target remains a safe public HTTPS destination.
4. The final direct page responds successfully.
5. Bright Studio can extract supported text from the response within the bounded size limit.
6. An authoritative source is linked to the Claim and has successful non-empty
   extraction; no further Claim-fact test is applied to that source.
7. A non-authoritative fetched page materially matches the cited manuscript Claim.
8. An accepted official/first-party source uses the single-source trust route.
9. A non-official or secondary source has independent corroboration for the
   same material Claim.
10. The proposed source-level evidence excerpt, when present, exists in the
   extracted page text.
11. High-risk Claim values and qualifiers pass server verification against the
    fetched final page.
12. Missing information dates or reader-visible review dates remain diagnostics
    unless a separate high-risk policy explicitly requires them.

Search-result pages, navigation pages, inaccessible pages, unsupported binary
documents, empty pages, malformed documents, fabricated values, fabricated
excerpts, and conflicting high-risk Claims are excluded. Secondary blogs,
copied articles, and community posts are not automatically excluded; they need
independent corroboration before they become trusted Evidence.

Several official sources may divide the required Claims. Generation starts only when their combined verified Coverage is complete.

## Failure Contract

When any required Claim remains uncovered or any candidate fails the applicable checks:

- manuscript Generation is not called;
- Quality Review is not called;
- no draft document is created from the failed source set;
- the workflow returns `APPROVAL_SOURCE_NOT_READY` with the uncovered Claim fields or concrete source rejection reasons;
- the user may retry source discovery without publishing or external platform writes.

The following conditions always block before Generation:

- URL absent from actual search diagnostics;
- invented or malformed URL;
- unsafe redirect or failed Fetch;
- unsupported, empty, malformed, or oversized content;
- unofficial final URL;
- missing Claim field, value, or evidence excerpt;
- Claim value absent from the fetched page;
- fabricated Claim excerpt;
- different date, amount, ratio, duration, or unit;
- stale required evidence under policy;
- partial Claim Coverage.

`APPROVAL_SOURCE_NOT_READY` is a controlled Bright Studio workflow state. An API route may map it to an HTTP client-error response; that must not be described as proof that the upstream OpenAI transport itself returned HTTP 400.

## Generation Boundary

Generation receives only the server-verified preflight bundle, including the exact accepted Claim field, value and evidence excerpt for each source.

Generation must not:

- run another web search;
- add or replace a source URL;
- change a verified date, amount, percentage, duration, unit, institution, artwork metadata value, eligibility rule, threshold, quotation, or legal requirement;
- assert a factual value unsupported by the bundle.

The server recomputes and verifies the Verification Plan/Snapshot contract before the Generation call. Optional nonverified Claims are excluded from the verified bundle; missing/nonverified required Claims block Generation.

Bright Studio does not ask Generation to create the final reader-visible source section. The deterministic Evidence and Claim verification path owns final source adoption and projection.

## Post-Generation Verification Boundary

Generation output is not trusted merely because the input bundle was verified.

After Generation, deterministic server logic binds supported generated values back to verified Claim IDs and trusted source IDs. High-risk scalar detection currently covers deterministic money, ratio, date, duration and legal-article patterns.

Unsupported detected values are recorded as unverified diagnostics rather than being self-labeled verified by the AI.

Verification state is persisted as server-owned canonical Content metadata. Quality evaluates the **current manuscript** against the persisted VerificationSnapshot and confirmed Verification Plan so an older verified binding cannot survive a later unsupported edit unchanged.

When current-manuscript verification fails, standard Quality approval is blocked. Platform publishing readiness consumes this shared Core result rather than implementing a separate WordPress or Tistory source-truth system.

Deterministic scalar binding is not claimed to be universal semantic extraction of every arbitrary prose fact.

## AI Call and Cost Policy

For approval-preparation content:

- Source Preflight: 0 calls when scoped Planning has no required factual Claims, otherwise 1 small discovery call
- Generation: 1 call
- Quality Review: 1 call

The preflight usage record is stored separately as `source_preflight` so the cost ledger reflects the real call count.

No additional AI call is introduced for Claim verification. URL, Fetch, extraction, source identity, value, excerpt, normalization, temporal/freshness evaluation, Coverage, binding, edit integrity and publishing-readiness checks are deterministic server logic.

## Architecture Ownership

The Source Readiness Gate belongs to Core AI and Core Approval policies. It is not a WordPress-only publishing rule.

Platform-specific source profiles may define their own official institutions, but the sequence and failure contract remain shared across WordPress, Tistory, YouTube, Naver Cafe, Blog, and Shopping applications.

The appropriate variation boundary is Project/content-domain/Claim-risk policy, not a duplicate factual-verification engine per publishing platform.

## Current Verification Status

As of 2026-08-08, the Verification Claim / Source implementation is automated-verified on the active PR branch. Detailed implementation status, regression inventory, CI evidence and remaining live Bright Finance Provider Gate are tracked in:

```text
Docs/current/04_DEVELOPMENT/07_VERIFICATION_CLAIM_SOURCE_STATUS.md
```

The latest Bright Finance live external Provider run after the current correction remains pending. Automated tests must not be reported as that external verification.

## Non-goals

Preflight does not replace final deterministic Claim verification. It proves that every Planning-required factual Claim has usable official Evidence before writing; final verification still confirms that every factual Claim in the completed manuscript remains supported by the adopted source pages.

This policy also does not mean every newly discovered website is automatically trustworthy. New sources may be processed dynamically, but they still must pass official-source, Claim-support, freshness and conflict policy before adoption.
