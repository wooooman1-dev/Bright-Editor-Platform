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

The base branch remains unchanged until explicit user approval and merge. No publishing, WordPress Draft save or public write is part of this work.

## Problems reproduced from real local data and UI

### 1. Cross-Project Connection exposure

The Workspace-owned health GSC and NAVER Connections were rendered as `이 Project에 배정 가능` inside art and finance Project areas. Clicking the finance-area button sent the finance Project ID correctly, but the Repository rejected the second owner with HTTP `409`.

The conflict response proved the server guard worked, but the UI was still wrong: a Connection already owned by health must not be offered to another Project at all. The visible card also exposed unrelated edit, sync, disable, disconnect and delete actions in the wrong Project area.

### 2. Architecture contradiction

The earlier Settings design and tests allowed one Connection to be checked for several Projects, while the later Repository owner policy enforced one owner. This produced an inconsistent contract:

```text
old UI/docs: one Connection may be used by multiple Projects
Repository: second Project claim is rejected
```

The corrected contract is:

```text
one DataSourceConnection = zero or one Project owner
one credential = reusable by multiple separate resource Connections
```

### 3. Duplicate persisted Project

The real `studio-data.json` contained two different Project IDs with the same normalized name `건강정보`:

```text
canonical: project-mroi30xh-spr2on
- created 2026-07-17
- 17 Content records
- health GSC and NAVER references

duplicate: project-mrzlm3d6-sv8lqm
- created 2026-07-25
- 4 Content records
- no Data Source references
```

The duplicate Project was not empty. Read-only inspection found the source Project ID in:

```text
studio-data.json
- Project record: 1
- Content.projectId: 4
- planning.opportunityCandidates[].projectId: 12
- opportunity.projectId: 4
- mediaMetadata[].metadata.projectId: 9
- total exact occurrences: 30

metadata.json
- opportunity-evidence.projectId: 3
```

Deleting the duplicate Project record directly would orphan Content, Planning, canonical Opportunity, Media and Evidence scope. A verified two-file migration was required and later completed successfully.

### 4. Mutable resource identity

An established Connection could previously be edited to point to another GSC property, GA4 property, AdSense account/site, YouTube channel or NAVER keyword set while retaining the old Connection ID. That could mix historical Snapshot and Evidence records from different resources. Established resource identity must be immutable; a different resource requires a new Connection.

### 5. Stale Google resource candidates on credential reuse

A new GSC Connection created through existing Google authentication copied the source Connection's stored `availableResources` instead of querying Google again. The real UI therefore showed only older Tistory properties and omitted the already registered `sc-domain:brightjaetech.kr` property.

Credential reuse now creates an authorized session and queries current Search Console sites or current owned YouTube channels before creating the new Connection. Failure does not fall back to stale candidates.

### 6. One unassigned Connection repeated under every Project

After `sc-domain:brightjaetech.kr` was successfully authenticated, selected with `siteOwner` permission and assigned to the `밝은재테크` Project, a separate unassigned GSC Connection remained. The old projection rendered that same unassigned Connection under every Project area's `배정 가능한 연결` section.

The stored ownership was not duplicated, but the UI repeated the same Connection card, configuration controls, sync controls and deletion controls across health, exercise, art and finance areas. This was misleading and unsafe as an editorial management surface.

The corrected projection is:

```text
Workspace 미배정 연결
└── every ownerless Connection appears exactly once
    └── one Project selector and assignment action

Project별 데이터 소스 영역
└── each Project shows only Connections it actually owns
```

## Final ownership model

```text
Project = brand, topic, audience and content-strategy boundary
Platform Target = publishing destination inside a Project
Credential = reusable authentication secret
DataSourceConnection = one site/channel/account/keyword resource
DataSourceProjectOwner = zero or one Project owner for a Connection
ProjectDataSourceReference = explicit enabled use record for that owner
Workspace unassigned area = ownerless Connection projection shown once
Project data source area = assigned-only projection bound to one immutable Project ID
```

## Implemented correction

### UI

- Project areas render from immutable Project IDs.
- identical Project IDs are deduplicated defensively in area state;
- normalized duplicate Project names produce a visible warning;
- each Project area calculates only `assigned`: Connections owned by that Project;
- ownerless Connections are calculated once through `workspaceUnassignedConnections`;
- one `Workspace 미배정 연결` area renders each ownerless Connection exactly once;
- each Workspace card provides one Project selector and `선택한 Project에 배정` action;
- after assignment, the card leaves the Workspace area and appears only in the selected Project area;
- a Connection owned by another Project is never rendered in the current Project area;
- the Connection editor uses one Project selector instead of multi-select checkboxes;
- OAuth return preserves at most one pending Project selection;
- established resource identity fields are disabled with guidance to add a new Connection;
- direct GSC/NAVER creation from a Project area still preselects that Project.

### API and Repository boundary

- public Workspace references are projected from Project-scoped Repository reads;
- public output exposes at most one owner reference per Connection;
- a second Project claim returns a Project-specific `409 DATA_SOURCE_PROJECT_SCOPE_CONFLICT` before Repository save;
- Repository atomic ownership remains the final concurrency guard;
- established resource identity changes return `409 DATA_SOURCE_CONFLICT`;
- same-Provider Google credential reuse creates a new Connection ID and does not copy owner, Snapshot or Evidence;
- credential reuse queries current Google resources rather than copying stale candidate metadata.

### Project identity persistence

A `ProjectIdentityPersistenceStore` wraps the canonical `studioStore` boundary.

It rejects:

- duplicate Project IDs;
- newly introduced same-Workspace Project names after NFKC, trim, whitespace collapse and locale-aware lowercase normalization;
- renames that introduce a duplicate name.

It permits:

- a legacy duplicate set to remain unchanged until migration;
- a duplicate set to be reduced by a verified migration.

### Verified duplicate Project merge command

Command:

```text
npm run project:merge-duplicate -- --source <duplicate-id> --target <canonical-id>
```

Safety gates:

1. refuse while `.next/dev/lock` exists;
2. acquire exclusive locks for `studio-data.json` and `metadata.json`;
3. require source and target Projects in the same Workspace;
4. require equal normalized names;
5. fingerprint both files before replacement;
6. create timestamped backups of both files;
7. recursively replace only exact source Project ID string values;
8. remove only the source Project record;
9. write both files through temporary files;
10. re-read both persisted snapshots;
11. require exact equality with intended results;
12. require zero remaining source Project ID references;
13. restore both backups if either replacement or verification fails.

The real local migration completed with:

```text
Content moved: 4
Media metadata moved: 9
Opportunity Evidence moved: 3
canonical health Project Content: 21
remaining source Project ID references: 0
both-file reread verification: passed
```

## Automated coverage added or updated

Coverage includes:

- each Project receives only its assigned Connection set;
- ownerless Connections are returned once for the Workspace area;
- Project-owned Connections are excluded from the Workspace-unassigned projection;
- no `buckets.available` rendering remains in Project areas;
- the Workspace area has one explicit Project selector and assignment action;
- maximum one explicit Project selection;
- duplicate normalized Project name detection;
- public single-owner reference projection;
- Project-specific second-owner conflict;
- atomic Repository conflict and concurrent first assignment;
- established GSC resource replacement rejection;
- NAVER keyword identity immutability;
- safe Google credential reuse with current Search Console or YouTube resource refresh;
- new duplicate Project persistence rejection;
- legacy duplicate persistence and reduction rules;
- nested Content, Planning, Opportunity, Media and Evidence migration;
- two-file backup, write and reread verification;
- development-server lock refusal.

## CI status

The Workspace-unassigned projection implementation was automated-verified at commit `72fc25c1a1678f6ed5550480531ae25f9a0d2c20`:

```text
GitHub Actions run: 30916704988
Job: 92016550528
TypeScript typecheck: passed
ESLint zero-warning gate: passed
complete non-E2E Vitest suite: passed
Next.js production build: passed
Job conclusion: success
```

The subsequent documentation commit `02380b83cbb2e2551a3c2d6c579a1f0680a4b996` was also verified on the same four gates:

```text
GitHub Actions run: 30917247322
Job: 92018384935
TypeScript typecheck: passed
ESLint zero-warning gate: passed
complete non-E2E Vitest suite: passed
Next.js production build: passed
Job conclusion: success
```

## Remaining local external verification

Automated verification does not prove the newly rendered local UI. Local verification still requires:

1. pull the feature branch and restart the development server;
2. confirm `Workspace 미배정 연결` appears once;
3. confirm the remaining ownerless GSC Connection appears only in that Workspace area;
4. confirm health, exercise, art and finance Project areas show only their actual assigned Connections;
5. assign or delete the remaining ownerless GSC Connection deliberately after checking its exact resource and credential state;
6. run manual sync for `sc-domain:brightjaetech.kr` and confirm Snapshot and Evidence creation;
7. verify finance Opportunity Planning uses only the finance-owned GSC/NAVER Evidence;
8. verify real YouTube OAuth, GA4 and AdSense flows separately.

Automated success does not replace real local UI, persisted metadata or Provider verification.

## Opportunity Planning scope correction

Read-only inspection of the real finance Project on 2026-08-05 confirmed that its GSC and NAVER Connections were owned and referenced by the correct Workspace and Project, both had successful Snapshots, and NAVER had nine normalized fresh relative-trend Evidence records. The current Planning bundle nevertheless contained only internal `brightStudio` content-gap Evidence.

The confirmed cause was a second lexical Project-metadata filter inside `OpportunityEvidenceService.buildPlanningBundle()`. After the explicit single-Project owner/reference gate passed, that filter compared broad Project labels such as `생활경제` and `재테크` with configured NAVER resource keywords such as `예금`, `적금`, `고정비`, `보험` and `대출`. Because those valid finance concepts did not share a literal substring with the broad Project labels, every NAVER Evidence record was removed before the existing Planning AI call.

The correction keeps Workspace, Connection owner/reference, enabled state and connection lifecycle checks as the Project scope gate. It passes context-bearing Evidence from those explicitly owned Connections into Planning, while the existing server candidate matcher still requires keyword/topic/page relevance before attaching Evidence or classifying a candidate. GSC remains first-party site search performance and NAVER remains a relative trend index; neither is converted into absolute market search volume.

Regression coverage now includes current-Project GSC/NAVER input, other-Workspace exclusion, other-Project exclusion, GSC semantic limits, fresh NAVER classification and stale browser-snapshot protection for newly completed Today's Content candidates.

## Opportunity confidence and Korean presentation correction

Read-only inspection of the next real finance Today’s Content (`content-msg4b4rg-jzkank`) found three fresh market-opportunity candidates with matched NAVER relative-trend, NAVER rising-trend and internal content-gap Evidence. The stored Evidence confidence values were `1`, `1` and `0.75`, but every persisted candidate and the top-level plan stored `confidence: 0`.

The confirmed scoring defect was the classifier expression `min(AI candidate confidence, matched Evidence confidence average)`. The Planning parser normalizes a missing, non-numeric or explicit zero AI confidence to zero, so valid server-owned Evidence could never raise the result above zero. Candidate confidence is now derived from the mean confidence of matched verified, usable Evidence. The no-match user-specified fallback remains unchanged, and Workspace, Project, Connection and candidate-relevance filters are untouched.

The stored Evidence/provider/type contracts remain unchanged. `PrimaryKeywordConfirmation` now uses a deterministic presentation formatter for confidence percentage, content depth, topic complexity, provider, Evidence type, metric, unit, freshness, platform and known limitation text. Duplicate NAVER statements are collapsed after translation. NAVER remains a relative trend rather than absolute search volume, rising trend alone does not establish market size, GSC remains site performance, and no AI translation call was added.
