# Approval Source Preflight

## Purpose

Approval-preparation content must not begin manuscript Generation until Bright Studio has verified every factual Claim required by the confirmed Content Opportunity against actual official source pages.

A single usable URL is not sufficient. Every required Claim must have a submitted field, value, and Claim-level evidence excerpt, and the server must independently confirm those values against the fetched final page before Generation starts.

This policy prevents the system from spending a full Generation call on a manuscript whose factual basis is incomplete, inaccessible, fabricated, mismatched, or outside the active official-source profile.

## Scope

The preflight applies only when all of the following are true:

- the Content uses an AdSense approval-preparation profile;
- a confirmed Content Opportunity exists;
- the production structured long-form Generation path is used.

Standard content and legacy non-structured calls remain unchanged.

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
→ required factual Claim derivation
→ primary-topic Claim scope
→ official source discovery when Claims remain
→ actual web-search URL membership check
→ URL safety and official-source policy
→ direct page fetch
→ redirect final URL recording
→ supported text extraction
→ source-level evidence excerpt match
→ Claim field/value/evidenceExcerpt verification
→ normalized date/amount/ratio/duration/unit comparison
→ complete Claim Coverage Gate
→ manuscript Generation 1 call
→ deterministic Claim verification
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

## Source Readiness Gate

A source may enter the Generation bundle only when all checks pass:

1. The URL was returned by the attached web-search tool in the same preflight response.
2. The URL is a public HTTPS URL and passes the shared network-boundary policy.
3. Every redirect target remains a safe public HTTPS destination.
4. The final direct page responds successfully.
5. Bright Studio can extract supported text from the response within the bounded size limit.
6. The final URL is accepted as an official source by the active approval profile.
7. The proposed source-level evidence excerpt exists in the extracted page text.
8. Every submitted Claim has field, value, and Claim evidence excerpt.
9. Every Claim value and excerpt passes server verification against the fetched final page.
10. All required Planning Claim fields are covered across the accepted source set.

Search-result pages, navigation pages, secondary blogs, copied articles, community posts, inaccessible pages, unsupported binary documents, empty pages, malformed documents, unofficial pages, fabricated values, fabricated excerpts, and incomplete Claim sets are excluded.

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
- partial Claim Coverage.

## Generation Boundary

Generation receives only the server-verified preflight bundle, including the exact accepted Claim field, value, and evidence excerpt for each source.

Generation must not:

- run another web search;
- add or replace a source URL;
- change a verified date, amount, percentage, duration, unit, institution, artwork metadata value, eligibility rule, threshold, quotation, or legal requirement;
- assert a factual value unsupported by the bundle.

Bright Studio does not ask Generation to create the final reader-visible source section. The deterministic Evidence and Claim verification path owns final source adoption and projection.

## AI Call and Cost Policy

For approval-preparation content:

- Source Preflight: 0 calls when scoped Planning has no required factual Claims, otherwise 1 small discovery call
- Generation: 1 call
- Quality Review: 1 call

The preflight usage record is stored separately as `source_preflight` so the cost ledger reflects the real call count.

No additional AI call is introduced for Claim verification. URL, Fetch, extraction, value, excerpt, normalization, and Coverage checks are deterministic server logic.

## Architecture Ownership

The Source Readiness Gate belongs to Core AI and Core Approval policies. It is not a WordPress-only publishing rule.

Platform-specific source profiles may define their own official institutions, but the sequence and failure contract remain shared across WordPress, Tistory, YouTube, Naver Cafe, Blog, and Shopping applications.

## Non-goals

Preflight does not replace final deterministic Claim verification. It proves that every Planning-required factual Claim has usable official Evidence before writing; final verification still confirms that every factual Claim in the completed manuscript remains supported by the adopted source pages.
