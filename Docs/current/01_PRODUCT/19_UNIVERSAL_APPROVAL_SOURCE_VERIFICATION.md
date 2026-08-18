# Universal Approval Source Verification

Version: 1.1  
Status: Implemented contract  
Scope: Bright Editor Platform Core Approval Evidence

## 1. Purpose

Bright Studio must not assume that future sources use known URLs, fixed HTML structures, one document format, or a pre-registered Claim role.

The universal verifier therefore applies one deterministic pipeline to every source proposed for approval-preparation content. The system does not promise that every source passes. An authoritative source becomes trusted after actual search discovery, safe Fetch, HTTP 2xx, and supported non-empty extraction; its explicitly linked Claims are then verified without re-running anchor, semantic, normalized-value, freshness, or corroboration checks. Non-authoritative sources still require material Claim matching and independent corroboration.

The completion criterion is:

```text
Any newly discovered source can pass from its real fetched content and its
applicable trust route. Missing, mismatched, or fabricated high-risk Claims
block the applicable Gate; general Claim diagnostics do not automatically
block manuscript Generation.
```

## 2. Non-negotiable guarantees

For every submitted source URL and factual Claim:

1. Planning derives the required factual Claim set before manuscript Generation.
2. The proposed URL must exist in the actual web-search diagnostics from the same Source Preflight response.
3. The URL is classified before the first request.
4. Every redirect target is classified before the redirect request.
5. Local, private, reserved, credential-bearing, non-HTTPS, and non-standard-port URLs are blocked before access.
6. Redirect loops stop after a fixed maximum.
7. Each request has a fixed timeout and bounded response size.
8. MIME metadata and actual bytes determine the document Adapter.
9. Every byte sequence receives one extraction status.
10. Every source receives one terminal verification status.
11. The redirect final URL, HTTP status, content type, document format, extraction status, and content length are recorded.
12. The final URL must pass the public URL and content-relevance policy. Official/first-party status selects the single-source route; it is not required for every citation.
13. Every submitted Claim must contain `field`, `value`, and `evidenceExcerpt`.
14. The Claim field must belong to the Planning-required Claim set.
15. The Claim evidence excerpt must exist in the fetched final page.
16. The Claim value must exist in or be deterministically normalized from the fetched final page context.
17. Dates, money amounts, percentages, durations, and units must match exactly after canonical normalization.
18. Multiple sources may divide material Claims; non-official sources require independent corroboration for the same material Claim.
19. An uncovered or mismatched material Claim is a diagnostic; only an unsupported or conflicting high-risk Claim blocks the applicable approval Gate.
20. Known URL-to-Claim mappings are diagnostics only and are not required for a new official URL.
21. Search candidates never change an existing verified Snapshot until selected.
22. Unknown legal Claims receive deterministic dynamic Claim IDs and cannot silently disappear.
23. No additional AI request is introduced for deterministic source verification.
24. The same Core contract is reused by WordPress, Tistory, and future platform Apps.

## 3. Processing pipeline

```text
Confirmed Planning
→ required factual Claim derivation
→ Source Preflight AI search
→ actual search-result URL membership check
→ URL safety policy
→ bounded sequential Fetch
→ redirect-by-redirect safety policy
→ final URL and HTTP terminal result
→ bounded response bytes
→ actual format detection
→ document Adapter
→ normalized source text
→ source identity and official/secondary trust route
→ source evidence excerpt diagnostics (required for non-authoritative sources)
→ Claim field/value/evidenceExcerpt diagnostics (required for non-authoritative sources)
→ normalized quantitative value comparison (required for non-authoritative sources)
→ material Claim and applicable trust-route Gate
→ manuscript Generation
→ persisted verified Claim bundle
→ final deterministic Evidence verification
→ readiness projection
```

Generation is blocked only when the applicable high-risk source Gate returns
`incomplete`; general Claim coverage remains a diagnostic for the manuscript.

## 4. Source and Claim contract

Source Preflight must return:

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

The source-level excerpt proves page relevance. Claim-level values and excerpts prove the factual Coverage needed by Planning.

A URL mapping may expose `hintedClaimFields` for diagnostics. It does not:

- authorize a Claim;
- replace the submitted Claim contract;
- exempt a known URL from value or excerpt verification;
- prevent an unseen official URL from passing;
- satisfy Coverage without actual fetched content.

## 5. URL safety contract

The verifier accepts only public HTTPS URLs.

The following are rejected before access:

- malformed URLs;
- non-HTTPS protocols;
- embedded usernames or passwords;
- non-standard HTTPS ports;
- localhost and single-label internal hosts;
- `.local`, `.internal`, `.lan`, `.home`, `.test`, `.invalid`, `.example`, and `.onion` hosts;
- loopback, link-local, private, carrier-grade NAT, documentation, benchmarking, multicast, and reserved IPv4 ranges;
- loopback, link-local, unique-local, documentation, and private-mapped IPv6 ranges;
- known cloud and cluster metadata hostnames.

Redirects use manual handling. Every target passes the same URL safety policy before the next request. A redirect to a private target is never followed.

## 6. Fetch limits

| Control | Contract |
|---|---|
| Request timeout | 12 seconds |
| Redirect count | Maximum 5 redirects |
| Response body | Maximum 1,500,000 bytes |
| Request order | Sequential per Source Preflight execution |

A declared or streamed body that exceeds the limit is terminated and classified as `content_too_large`.

## 7. Document format Adapters

The Core Adapter recognizes these formats from MIME metadata and actual bytes:

| Format | Handling |
|---|---|
| HTML / XHTML | Script, style, noscript, comments, and tags removed; title and publisher metadata extracted |
| Plain text | UTF-8 decoding and normalized text extraction |
| JSON | Bounded-depth deterministic value flattening |
| XML | Root validation, title extraction, and markup removal |
| CSV / TSV | Quoted-field parser with bounded rows and columns |
| PDF with directly readable text layer | Conservative PDF literal-text extraction |
| Image-only or unsupported PDF encoding | `unsupported_content_type` |
| Unknown binary | `unsupported_content_type` |
| Empty response | `empty_content` |
| Malformed structured document | `malformed_content` |
| Oversized document | `content_too_large` |
| Network failure | `unreachable` |

Unsupported input receives a terminal diagnostic and never becomes verified Evidence.

## 8. Claim value normalization

The verifier compares exact canonical values rather than loose numeric similarity.

Supported normalization includes:

- dates: `2025년 9월 1일`, `2025. 9. 1.`, `2025-09-01`, `2025/09/01`, `20250901`, and exact compact dates in fetched URLs such as `efYd=20250901`;
- Korean currency units and numeric won values, such as `1억원` and `100,000,000원`;
- percentages and `퍼센트` notation;
- durations in years, months, days, hours, and minutes;
- measurement units including centimetres, millimetres, metres, kilograms, and grams.

A similar but different date, amount, ratio, duration, or unit does not pass.

## 9. Source verification statuses

A source ends in one of these states:

- `verified`: all required checks passed;
- `unreachable`: request, timeout, URL safety, or HTTP access failed;
- `unsupported_content_type`: no safe text Adapter exists;
- `empty_content`: no usable source text was extracted;
- `malformed_content`: the structured document could not be parsed safely;
- `content_too_large`: the response exceeded the bounded limit;
- `unsupported_claim`: the selected source has no linked supported Claim;
- `unofficial_source`: the source is outside the active official-source policy;
- `fact_mismatch`: a linked Claim does not match a non-authoritative page;
- `duplicate_source`: the canonical source already exists;
- `excluded`: the source remains an unselected candidate.

`verified` means an authoritative source passed authority, HTTP fetch, and
extraction, or a non-authoritative source matched the applicable material Claim
and passed its trust route. `unofficial_source` is no longer an
automatic rejection. A non-official source remains `needs_review` until an
independent source corroborates the same material Claim. Missing information
dates or reader-visible review-date labels do not make a source unverified.

Trust routes are recorded as `official_single` for an accepted official or
first-party source, and `external_corroborated` for a non-official source that
has independent support for the same material Claim.

## 10. Future Claim contract

Known policy Claims retain stable roles. A previously unknown legal assertion with an explicit law or article anchor receives a deterministic field:

```text
genericClaim:<stable hash>
```

The generic Claim becomes required for the current Revision, can be verified from official Evidence, remains uncovered when no source supports it, and never disappears merely because it was not pre-registered.

## 11. Candidate isolation

```text
Candidate Pool ≠ Selected Evidence ≠ Verified Snapshot
```

A failed or unrelated candidate cannot erase another verified source or reduce existing verified Coverage. Readiness changes only when the manuscript Claim set, selected Evidence set, policy profile, publishing context, or verified source content changes.

## 12. Verification Snapshot

A completed Snapshot records:

- manuscript Revision identity;
- selected source identity and canonical URL;
- actual final URL;
- HTTP status and content type;
- detected document format;
- extraction status and reason;
- extracted content length;
- official-domain result;
- submitted and matched Claim fields;
- verified Claim values and excerpts;
- required, covered, and uncovered Claim fields;
- source check time;
- manuscript information date;
- final Claim review time.

Search candidates remain diagnostics and are not part of the approval decision identity.

## 13. Mandatory regression coverage

The automated suite must cover:

- unseen official URL with exact Claim value and excerpt;
- unseen official URL without any URL-role mapping;
- URL absent from actual search diagnostics;
- fabricated URL, Claim value, and Claim excerpt;
- missing Claim field, value, or excerpt;
- safe redirect and final URL recording;
- failed Fetch and unsupported content;
- partial Claim Coverage with Generation call count zero;
- multiple unseen sources dividing complete Coverage;
- exact dates in all supported formats;
- similar but different dates;
- equivalent and different money values;
- fixed art metadata requirements;
- no fallback `eligibility` or `statutoryBasis` when Planning contains neither;
- preservation of existing verified readiness when only candidates change.

Typecheck, lint, focused tests, the full test suite, production build, and diff validation must pass on the final branch Head before completion is reported.

## 14. Safety boundary

`verified` means the current deterministic rules confirmed the source content,
the material Claim match, and the applicable official-single or external-
corroborated trust route. It does not resolve every possible legal
interpretation or real-world dispute.

The platform guarantee is exact:

```text
Every source is safely classified.
Every Planning-required factual Claim is checked before Generation.
Only Evidence that passed an official-single or external-corroborated route
contributes to trusted Coverage.
Unknown or unsupported input cannot crash or falsely approve the manuscript.
```
