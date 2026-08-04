# Data Source Multi-Connection Development Status

Last updated: 2026-08-04

## Scope

This document records the implementation and verification state of Draft PR `#42` only.

```text
Base branch: fix/wordpress-full-audit
Feature branch: feat/data-source-multi-connections
Pull request: #42
PR state: Open / Draft / Unmerged
```

The existing `fix/wordpress-full-audit` branch remains unchanged by this feature branch until explicit user approval and merge.

## Problem reproduced

The Workspace contained one Search Console Connection for `https://bright-healthy.tistory.com/` and one NAVER Search Trend Connection for health keywords. Both were referenced by the health Project. The brightjaetech finance Project had no Data Source references.

The previous Settings UI did not expose an explicit new-connection workflow. Selecting a Provider could hydrate a preferred existing Connection, creating a risk that a user would edit the health resource instead of creating a separate finance resource.

## Implemented

- explicit `새 연결 추가` action
- clean Add state separated from exact Connection edit state
- Provider cards show same-Provider Connection counts
- multiple Search Console resources in one Workspace
- multiple NAVER Search Trend keyword-set Connections
- exact Project-to-Connection assignment UI
- new same-Provider Google resource Connection using an existing OAuth credential
- reference-aware credential protection during disconnect, delete and reconnect
- server-listed Search Console property validation
- YouTube Analytics Provider, OAuth scopes, owned-channel selection, official sync Adapter and `videoPerformance` Evidence
- provider-aware OAuth callback hydration using the exact created Connection ID
- documentation and regression coverage

## Automated verification

Verified at commit:

```text
12e20c83ed99732c8b88f962482efa8cc0e041fe
```

GitHub Actions evidence:

```text
Run: 30874382710
Job: 91882765362
Conclusion: success
```

Passed steps:

- TypeScript typecheck
- ESLint zero-warning gate
- complete non-E2E Vitest suite
- Next.js production build

A later documentation-only commit records this result. A final CI run for the documentation head must also pass before local verification begins.

## Not externally verified

The following remain real-environment gates:

- existing health GSC and NAVER Connections remain unchanged after loading the new UI
- new `brightjaetech.kr` Search Console Connection creation
- finance NAVER keyword-set Connection creation
- assignment of only finance Connections to the brightjaetech Project
- real sync of the new finance Connections
- Content Opportunity rerun using the correct finance external Evidence
- real YouTube OAuth approval
- owned YouTube channel selection
- YouTube Analytics Snapshot and Evidence creation
- GA4 and AdSense real-account verification

Automated success does not make these externally verified.

## Manual verification order

```text
1. Load Settings > Data Sources
2. Confirm existing health Connections are unchanged
3. Add GSC · 밝은재테크
4. Select brightjaetech.kr
5. Add NAVER · 밝은재테크 with finance keywords
6. Assign both finance Connections to the brightjaetech Project
7. Confirm health Connections are not assigned to that Project
8. Sync both finance Connections
9. Rerun Content Opportunity
10. Verify finance external Evidence is attached
11. Test YouTube Analytics separately
```

No publishing, WordPress Draft save or public write is part of this verification.
