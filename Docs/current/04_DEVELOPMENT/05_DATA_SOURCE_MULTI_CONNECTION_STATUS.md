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

## Problems reproduced

The Workspace contained one Search Console Connection for `https://bright-healthy.tistory.com/` and one NAVER Search Trend Connection for health keywords. Both were referenced by the health Project. The brightjaetech finance Project had no Data Source references.

The first multi-connection UI exposed a generic `새 연결 추가` action but immediately rendered the currently selected Provider form. NAVER creation existed behind Provider-card selection, yet that behavior was visually hidden. The Project selector also defaulted to the first Project and all Workspace Connections were displayed in one list, which made an unassigned Connection appear to belong to `건강 정보`.

These were UI ownership and assignment-visibility defects. The underlying model remained Workspace-owned Connections plus explicit Project references.

## Final ownership decision

```text
Project = brand, topic, audience and content-strategy boundary
Platform Target = Tistory, WordPress, YouTube or Naver Cafe publishing destination inside a Project
DataSourceConnection = Workspace-owned site, channel, account resource or keyword-set connection
ProjectDataSourceReference = explicit Project use permission for one Connection
```

Projects are not split merely by publishing platform. `건강 정보` may target Tistory, YouTube and Naver Cafe while sharing one Project strategy. `밝은재테크` may target WordPress while using its own finance GSC, GA4, AdSense and NAVER Connections.

## Implemented

- Project context moved to the first section
- no silent first-Project selection
- dedicated `새 Project 만들기` flow that returns to Data Sources with the new Project selected
- generic action changed to `Provider 선택해서 새 연결 추가`
- every enabled Provider card exposes `이 Provider 연결 추가`
- clean Add state separated from exact Connection edit state
- Provider cards show same-Provider Connection counts
- multiple Search Console resources in one Workspace
- multiple NAVER Search Trend keyword-set Connections
- all Workspace Project references returned through a safe public projection
- Connection editor lists explicit Project assignment checkboxes before save
- selecting no Project creates a Workspace-only Connection
- pending Project choices survive a new Google OAuth callback until final resource save
- selected Project view separates `배정된 연결` from `배정 가능한 Workspace 연결`
- explicit `이 Project에 배정` and `이 Project에서 제외` actions
- new same-Provider Google resource Connection using an existing OAuth credential
- reference-aware credential protection during disconnect, delete and reconnect
- server-listed Search Console property validation
- YouTube Analytics Provider, OAuth scopes, owned-channel selection, official sync Adapter and `videoPerformance` Evidence
- provider-aware OAuth callback hydration using the exact created Connection ID
- documentation and regression coverage

## Automated verification

Initial multi-connection implementation verification:

```text
Commit: 12e20c83ed99732c8b88f962482efa8cc0e041fe
Run: 30874382710
Job: 91882765362
Conclusion: success
```

Initial documentation-head verification:

```text
Commit: aa1e0833d2d49d9ba9e8186a128929e2e40c247a
Run: 30875240227
Job: 91885280528
Conclusion: success
```

Project-first correction verification:

```text
Commit: dd9e2c9f21c69b17d266c2e9b0f15020bb763f3c
Run: 30877969290
Job: 91893148820
Conclusion: success
```

The successful Project-first job passed:

- TypeScript typecheck
- ESLint zero-warning gate
- complete non-E2E Vitest suite
- Next.js production build

The feature is automated-verified. Local UI behavior and real Provider interactions remain separate external gates.

## Not externally verified

The following remain real-environment gates:

- explicit Project selector starts blank unless a valid `projectId` return parameter exists
- NAVER card exposes its own visible create action
- unassigned Connections appear only under `배정 가능한 Workspace 연결`
- Project creation returns to Data Sources with the new Project selected
- existing health GSC and NAVER Connections remain unchanged
- the accidentally created unconfigured second GSC Connection remains unassigned until explicitly assigned or deleted
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
1. Pull the latest feature branch and reload Settings > Data Sources
2. Confirm no Project is silently selected unless projectId is present in the URL
3. Select 건강 정보 and confirm its existing GSC and NAVER Connections appear under 배정된 연결
4. Confirm the unconfigured second GSC appears under 배정 가능한 Workspace 연결
5. Confirm every enabled Provider, including NAVER Search Trend, has 이 Provider 연결 추가
6. Select the existing 밝은재테크 Project
7. Complete GSC · 밝은재테크 and select brightjaetech.kr
8. Add NAVER · 밝은재테크 with finance keywords
9. Confirm both finance Connections are assigned only to 밝은재테크
10. Sync both finance Connections
11. Rerun Content Opportunity
12. Verify finance external Evidence is attached
13. Test YouTube Analytics separately
```

No publishing, WordPress Draft save or public write is part of this verification.
