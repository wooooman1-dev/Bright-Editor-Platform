# Universal Approval Source Verification

Version: 1.0  
Status: Implemented contract  
Scope: Bright Editor Platform Core Approval Evidence

## 1. Purpose

Bright Studio must not assume that every future source uses the same URL, HTML structure, document format, or Claim vocabulary.

The source verification engine therefore guarantees a deterministic terminal result for every source input. The guarantee is not that every source is approved. The guarantee is that no source can crash the readiness workflow, silently disappear, corrupt an existing verified Snapshot, or become verified without passing all required checks.

## 2. Non-negotiable guarantees

For every submitted source URL and response body:

1. The URL is classified before the first request.
2. Every redirect target is classified before the redirect request.
3. Local, private, reserved, credential-bearing, non-HTTPS, and non-standard-port URLs are blocked before access.
4. Redirect loops stop after a fixed maximum.
5. Each request has a fixed timeout and retry limit.
6. The response body has a fixed byte limit while streaming and after decompression.
7. MIME metadata is checked, but format detection also inspects the actual bytes.
8. Every byte sequence receives one extraction status.
9. Every Evidence source receives one verification status.
10. One failed source cannot abort or remove another source result.
11. Search candidates never change Claim coverage or an existing verified Snapshot until selected.
12. Unknown legal Claims are assigned deterministic dynamic Claim IDs and either verified from official Evidence or left unverified.
13. A source is marked verified only after access, extraction, official-domain, selection, and Claim-match checks pass.
14. Source Preflight derives the required factual Claim set from the confirmed Planning state and blocks manuscript Generation until every required Claim has verified official-source coverage.
15. Partial official-source coverage is reported as incomplete and cannot spend the manuscript Generation call.
16. No additional AI request is introduced by source verification.
17. The same Core contract is reused by WordPress, Tistory, and future platform Apps.

## 3. Processing pipeline

```text
Source URL
→ URL safety policy
→ bounded sequential fetch
→ redirect-by-redirect safety policy
→ HTTP terminal result
→ bounded response bytes
→ actual format detection
→ format Adapter
→ normalized Claim text
→ official source policy
→ Candidate Pool
→ Selected Evidence
→ Claim role matching
→ Verified Claim Snapshot
→ readiness projection
```

Before manuscript Generation, Source Preflight applies the same URL safety, extraction, official-source, and Claim-match rules to every required factual Claim derived from the confirmed Planning state. Generation remains blocked when that preflight coverage is incomplete.

## 4. URL safety contract

The verifier accepts only public HTTPS URLs.

The following are rejected before access:

- malformed URLs
- non-HTTPS protocols
- embedded usernames or passwords
- non-standard HTTPS ports
- localhost and single-label internal hosts
- `.local`, `.internal`, `.lan`, `.home`, `.test`, `.invalid`, `.example`, and `.onion` hosts
- loopback, link-local, private, carrier-grade NAT, documentation, benchmarking, multicast, and reserved IPv4 ranges
- loopback, link-local, unique-local, documentation, and private-mapped IPv6 ranges
- known cloud and cluster metadata hostnames

Redirects use manual handling. Every target passes the same URL safety policy before the next request. A redirect to a private target is never followed.

## 5. Fetch limits

| Control | Contract |
|---|---|
| Request timeout | 12 seconds per attempt |
| Retry count | Maximum 3 attempts |
| Redirect count | Maximum 5 redirects |
| Response body | Maximum 1,500,000 bytes |
| Request order | Sequential per readiness execution |
| Retry statuses | 429, 502, 503, 504 |

A declared or streamed body that exceeds the limit is terminated and classified as `content_too_large`.

## 6. Document format Adapters

The Core Adapter currently recognizes these formats from MIME metadata and actual bytes:

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

An unsupported format does not cause a program error. It receives a terminal diagnostic and remains excluded from approval until a dedicated Adapter is added.

## 7. Source verification statuses

A source ends in one of these states:

- `verified`: all required checks passed
- `unreachable`: request, timeout, URL safety, or HTTP access failed
- `unsupported_content_type`: no safe text Adapter exists for the detected format
- `empty_content`: no usable source text was extracted
- `malformed_content`: the structured document could not be parsed safely
- `content_too_large`: the bounded response limit was exceeded
- `unsupported_claim`: the selected source has no supported or generic Claim role
- `unofficial_source`: the source is outside the active profile’s official-source policy
- `fact_mismatch`: the selected Claim does not match the official page
- `duplicate_source`: the canonical source already exists
- `excluded`: the source remains an unselected candidate

Only `verified` contributes to Claim coverage.

## 8. Future Claim contract

Known policy Claims retain named stable roles, such as statutory definition, threshold, contract-document duty, penalty restriction, and refund restriction.

A previously unknown legal assertion that contains an explicit law or article anchor is assigned a deterministic field:

```text
genericClaim:<stable hash>
```

The generic Claim:

1. becomes a required Claim for the current manuscript Revision;
2. can select an official candidate that matches its legal anchors, numbers, and significant terms;
3. is verified only when the official page supplies sufficient deterministic support;
4. remains unverified when no official source supports it;
5. never disappears merely because it was not part of the original hard-coded policy list.

This provides safe forward compatibility without an extra AI call and without falsely approving unknown law.

## 9. Candidate isolation

Search discovery and approval Evidence are separate datasets.

```text
Candidate Pool ≠ Selected Evidence ≠ Verified Snapshot
```

A new candidate may be unreachable, malformed, oversized, unsupported, unofficial, or unrelated. None of those candidate outcomes can reduce the coverage of already selected and verified Evidence.

Readiness changes only when one of these inputs changes:

- manuscript Claim set
- selected Evidence set
- policy profile
- relevant publishing context
- verified source content used by the Snapshot

## 10. Verification Snapshot

A completed Snapshot records:

- manuscript Revision identity
- selected source identity and canonical URL
- actual final URL
- HTTP status and content type
- detected document format
- extraction status and reason
- extracted content length
- official-domain result
- matched Claim fields
- Claim verification result
- source check time
- manuscript information date
- final Claim review time

Search candidates remain diagnostics and are not part of the approval decision identity.

## 11. Failure isolation

Every source is fetched and classified independently. Failure handling returns a page record instead of throwing out the full Evidence run.

A source failure may block its own required Claim, but it cannot:

- erase a different verified source;
- convert another source to failed;
- change Standard Quality approval;
- trigger an additional AI request;
- create, update, or publish an external WordPress or Tistory post.

## 12. Test contract

The automated suite must cover:

- valid HTML, text, JSON, XML, CSV, TSV, and text-layer PDF
- generic MIME with actual text sniffing
- image-only and unsupported PDF
- random binary byte sequences
- malformed JSON and XML-like input
- empty bodies
- declared and streamed oversized bodies
- unsafe initial URLs
- safe redirects
- redirect to private networks
- redirect loops
- unavailable and timed-out sources
- mixed batches where every input returns a terminal record
- valid selected Evidence plus future failed candidates
- deterministic generic future legal Claims
- selected sources without any Claim role
- canonical URL duplication
- preservation of existing verified readiness when only candidates change

Typecheck, lint, the full unit/integration suite, and production build must all pass on the final branch Head before the implementation is reported complete.

## 13. Safety boundary

`verified` means the current deterministic rules confirmed an official source and its linked Claim. It does not mean every possible legal interpretation or real-world dispute has been resolved.

The platform guarantee is exact:

```text
Every source is safely classified.
Only verified official Evidence passes.
Unknown or unsupported input cannot crash or falsely approve the manuscript.
New candidates cannot invalidate an existing verified Snapshot.
```
