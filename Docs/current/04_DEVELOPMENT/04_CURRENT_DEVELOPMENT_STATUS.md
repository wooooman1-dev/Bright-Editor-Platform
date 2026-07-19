# Bright Studio Current Development Status

## Baseline

Implementation baseline: Sprint 5 completed.

Architecture design baseline: Sprint 6, Sprint 7, and Sprint 8 approved and not implemented.

Internal name: Bright Editor Platform

Product name: Bright Studio

Architecture status: Frozen

## Sprint Summary

| Sprint | Scope | Design | Implementation | Verification | Current Status |
|---|---|---|---|---|---|
| 1 | Platform and Content Foundation | Approved | Complete | Complete | Completed |
| 2 | Content Processing Engine | Approved | Complete | Complete | Completed |
| 3 | Product UI Foundation | Approved | Complete | Complete | Completed |
| 4 | Usable Content and Safe Draft Workflow | Approved | Complete | Automated complete; real Tistory pending | Environment Verification Pending |
| 5 | Editorial Quality Pipeline | Approved | Complete | Complete | Completed |
| 6 | Presentation Architecture and Bright Components | Approved | Not started | Not started | Design Approved, Not Implemented |
| 7 | Project DNA, Content Library, and Internal Link Intelligence | Approved | Not started | Not started | Design Approved, Not Implemented |
| 8 | WordPress and Multi-platform Foundation | Approved | Not started | Not started | Design Approved, Not Implemented |

## Sprint 4 Real-use Gate

```text
Editor
→ Preview
→ Real Tistory Category
→ Final Confirmation
→ Draft Save
→ Reopen Draft
→ Verify Title
→ Verify Meaningful Body
→ Verify Category
→ Verify No Public Post
```

The Sprint may be called externally verified only when the result is `saved`. A Save click or `partially_verified` result is insufficient.

## Sprint 5 Editorial Pipeline

```text
AI Generation
→ Rule Quality Review
→ Final Editorial Review
→ Rule Quality Review
→ Automatic Manuscript Improvement (maximum 3)
→ Best Revision Selection
```

The Editor receives the first approved 95+ result or the highest-scoring bounded result.

The current Content creation baseline also treats AI topic selection as an atomic Content Opportunity. Automatic mode proposes complete opportunities; user-specified mode preserves the requested topic. Confirmation persists one versioned/fingerprinted strategy snapshot, generation uses the server copy, and Quality blocks cross-topic manuscripts before publishing. Search opportunity evidence is labeled as verified, estimated, inferred, or unknown; no measured volume is claimed without a connected provider. This strengthens the existing Generation and Quality Review calls and does not add a provider call.

## Sprint 6-8 Approved Architecture Baseline

The architecture designs for Sprint 6, Sprint 7, and Sprint 8 are approved.

```text
Sprint 6
Presentation Architecture and Bright Components
Design: Approved
Implementation: Not started
Verification: Not started

Sprint 7
Project DNA, Content Library, and Internal Link Intelligence
Design: Approved
Implementation: Not started
Verification: Not started

Sprint 8
WordPress and Multi-platform Foundation
Design: Approved
Implementation: Not started
Verification: Not started

The approved architecture documents are:

02_ARCHITECTURE/13_PRESENTATION_ARCHITECTURE.md
01_PRODUCT/09_PROJECT_DNA.md
01_PRODUCT/13_CONTENT_INTELLIGENCE.md
02_ARCHITECTURE/08_PLATFORM_ADAPTER.md

Approval of these documents does not mean that the corresponding features are implemented or verified.

Implementation status must be determined from the repository code, test results, external verification results, and this development status document.

## Next Actions

1. Preserve Sprint 1–5 as the current implementation baseline.
2. Preserve Sprint 4 real-account draft verification as the current external execution gate.
3. Treat Sprint 6, Sprint 7, and Sprint 8 as design approved but not implemented.
4. Re-check the repository code, tests, and approved architecture before selecting the next implementation scope.
5. Do not infer implementation order from Sprint numbering alone.
6. Protect all completed Sprint 1–5 behavior during future implementation.

## Workspace Data Source and Opportunity Intelligence Foundation (2026-07-18)

Implementation: complete in repository working tree; automated lint, typecheck, full test suite and production build passed.

Implemented foundation:

- Workspace-owned DataSourceConnection separated from Publishing PlatformConnection
- Project Data Source references
- DPAPI SecretStore reuse and secret-free public API models
- official Search Console, GA4, AdSense and NAVER Search Trend adapters
- separate raw snapshot files and normalized Evidence repository
- manual sync, duplicate-period cache, operation/version stale-result guard and failure isolation
- centralized freshness policy
- actual Project metadata/public-URL-limited internal growth Evidence
- server-only comprehensive / market opportunity / blog growth classification
- atomic Opportunity Evidence persistence and restore
- Evidence-aware recommendation cards and Workspace Settings Data Sources UI
- deterministic Quality Review guards for unsupported market claims

Not externally verified:

- real Google and NAVER accounts, OAuth scopes, selected resources, quotas and production response variants
- Google Ads Keyword Planning official access
- Google Trends official access

No provider is represented as externally verified until those manual checks pass. No commit or push is permitted before the external account gate requested for this work.

## Google Search Console OAuth 2.0 Connection (2026-07-19)

Implemented in the working tree:

- official `googleapis` server-side OAuth client
- exact development callback route `/api/data-sources/google/callback`
- short-lived, server-stored, one-time state with internal-return-path validation
- DPAPI storage for access/refresh tokens and granted scopes
- automatic access-token refresh with refresh-token preservation
- official Search Console `sites.list` projection and server-side property allow-list validation
- `configurationRequired` connection state until a site is selected
- Connection-ID-preserving reconnection and snapshot/Evidence retention
- legacy manual Search Console token detection and reconnect-required UI
- manual token removal from the Search Console settings form

Still requires external manual verification with a real Google test user, actual Search Console property, consent screen, token refresh, API quota, and production-shaped Search Analytics responses. The implementation must not be described as externally verified until that gate passes.

## Data Source Safe Deletion (2026-07-19)

Implemented in the working tree:

- distinct disable, disconnect and delete contracts
- versioned secret-free backup before deletion
- strong confirmation for active Connection disconnect-and-delete
- active sync invalidation and superseded polling state
- best-effort OAuth revoke, mandatory local SecretStore cleanup and pending-state invalidation
- atomic tombstone, Workspace-wide Project reference cleanup and Connection deletion
- Snapshot, raw Snapshot, Evidence, Content Opportunity, Quality, ContentDocument and History preservation
- tombstone write guards preventing late sync result persistence or Connection recreation
- same-provider Settings selection recovery after card deletion

Automated coverage verifies disconnected and active deletion, version/Workspace/idempotency boundaries, credential cleanup failure preservation, late sync rejection, Planning exclusion, historical Evidence ID retention and UI request binding. Actual deletion of the browser-observed legacy card remains a manual user-confirmed operation; tests do not delete real local Connection records.
