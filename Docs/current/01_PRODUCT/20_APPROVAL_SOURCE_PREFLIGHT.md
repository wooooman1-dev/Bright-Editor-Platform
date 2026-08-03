# Approval Source Preflight

## Purpose

Approval-preparation content must not begin manuscript Generation until Bright Studio has usable official-source coverage for every required factual Claim derived from the confirmed Content Opportunity.

This policy prevents the system from spending a full Generation call on a manuscript whose factual basis is missing, only partially covered, inaccessible, unextractable, or outside the active approval profile.

## Scope

The preflight applies only when all of the following are true:

- the Content uses an AdSense approval-preparation profile;
- a confirmed Content Opportunity exists;
- the production structured long-form Generation path is used.

Standard content and legacy non-structured calls remain unchanged.

## Required Workflow

```text
Confirmed Content Opportunity
→ official source discovery
→ URL safety and official-source policy
→ direct page fetch
→ supported text extraction
→ evidence excerpt match
→ required Claim-to-source matching
→ complete Claim coverage gate
→ usable source bundle
→ manuscript Generation 1 call
→ deterministic Claim verification
→ Quality Review 1 call
```

Source discovery is a small dedicated AI call. It must not write, outline, or revise the article.

## Source Readiness Gate

A source may enter the Generation bundle only when all checks pass:

1. The URL was returned by the attached web-search tool in the same preflight response.
2. The URL is a public HTTPS URL and passes the shared network-boundary policy.
3. Redirects remain inside safe public HTTPS destinations.
4. The direct page responds successfully.
5. Bright Studio can extract supported text from the response within the bounded size limit.
6. The page is accepted as an official source by the active approval profile.
7. The proposed evidence excerpt is found in the extracted page text.
8. Every required Planning Claim is linked to at least one accepted official page.
9. The linked Claim value or sentence is deterministically found in that page.
10. No required Claim remains uncovered.

Search-result pages, navigation pages, secondary blogs, copied articles, community posts, inaccessible pages, unsupported binary documents, empty pages, malformed documents, and unofficial pages are excluded.

## Failure Contract

When no candidate passes the Source Readiness Gate, or when accepted candidates cover only part of the required Claim set:

- manuscript Generation is not called;
- Quality Review is not called;
- no draft document is created from the failed source set;
- the workflow returns `APPROVAL_SOURCE_NOT_READY` with concrete rejection reasons;
- the user may retry source discovery without publishing or external platform writes.

## Generation Boundary

Generation receives only the server-verified preflight bundle. It must not run another web search, add another URL, or assert a factual amount, date, threshold, eligibility rule, statistic, quotation, artwork fact, or legal requirement that is not supported by that bundle.

Bright Studio does not ask Generation to create the final reader-visible source section. The deterministic Evidence and Claim verification path owns final source adoption and projection.

## AI Call and Cost Policy

For approval-preparation content:

- Source Preflight: 1 small discovery call
- Generation: 1 call
- Quality Review: 1 call

The preflight usage record is stored separately as `source_preflight` so the cost ledger reflects the real call count.

## Architecture Ownership

The Source Readiness Gate belongs to Core AI and Core Approval policies. It is not a WordPress-only publishing rule.

Platform-specific source profiles may define their own official institutions, but the sequence and failure contract remain shared across WordPress, Tistory, YouTube, Naver Cafe, Blog, and Shopping applications.

## Non-goals

Preflight does not replace final deterministic Claim verification. It proves that the confirmed Planning Claim boundary has complete usable official-source coverage before writing; final verification still re-extracts the completed manuscript Claims and confirms that every factual Claim actually written is supported by the adopted source pages.
