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

Deleting the duplicate Project record directly would orphan Content, Planning, canonical Opportunity, Media and Evidence scope. A verified two-file migration is required.

### 4. Mutable resource identity

An established Connection could previously be edited to point to another GSC property, GA4 property, AdSense account/site, YouTube channel or NAVER keyword set while retaining the old Connection ID. That could mix historical Snapshot and Evidence records from different resources. Established resource identity must be immutable; a different resource requires a new Connection.

## Final ownership model

```text
Project = brand, topic, audience and content-strategy boundary
Platform Target = publishing destination inside a Project
Credential = reusable authentication secret
DataSourceConnection = one site/channel/account/keyword resource
DataSourceProjectOwner = zero or one Project owner for a Connection
ProjectDataSourceReference = explicit enabled use record for that owner
Project data source area = UI projection bound to one immutable Project ID
```

## Implemented correction

### UI

- Project areas still render from immutable Project IDs.
- identical Project IDs are deduplicated defensively in area state;
- normalized duplicate Project names produce a visible warning;
- each Project area now calculates:
  - `assigned`: Connections owned by that Project;
  - `available`: Connections with no owner;
- a Connection owned by another Project is not rendered as available;
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
- same-Provider Google credential reuse still creates a new Connection ID and does not copy owner, Snapshot or Evidence.

### Project identity persistence

A `ProjectIdentityPersistenceStore` now wraps the canonical `studioStore` boundary.

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

The command preserves Content IDs, titles, manuscripts, Planning data, Opportunity IDs, Media IDs, Evidence IDs, Connections, credentials, Snapshots and publishing data. Only Project references move.

## Automated coverage added or updated

Coverage includes:

- other Project-owned Connections excluded from available lists;
- globally unassigned Connections available to each Project;
- maximum one explicit Project selection;
- duplicate normalized Project name detection;
- public single-owner reference projection;
- Project-specific second-owner conflict;
- atomic Repository conflict and concurrent first assignment;
- established GSC resource replacement rejection;
- NAVER keyword identity immutability;
- safe Google credential reuse for a new resource Connection;
- new duplicate Project persistence rejection;
- legacy duplicate persistence and reduction rules;
- nested Content, Planning, Opportunity, Media and Evidence migration;
- two-file backup, write and re-read verification;
- development-server lock refusal.

## CI status

The first correction run on commit `5b8e9f19fccb102be5af6dd74fd90d35cff7c264` failed only at TypeScript module declaration resolution for the new `.mjs` migration command:

```text
Run: 30909239529
Job: 91991562849
Typecheck error: TS7016 for scripts/merge-duplicate-project.mjs
```

A matching `.d.mts` declaration was added afterward. The current correction HEAD requires a fresh complete CI result. No implementation should be described as automated-verified until Typecheck, zero-warning Lint, complete non-E2E Vitest and production Build all pass on the same current HEAD.

## Remaining local external verification

After a green current CI result:

1. pull the feature branch;
2. stop the Next.js development server;
3. run the duplicate Project merge with:

```text
source: project-mrzlm3d6-sv8lqm
target: project-mroi30xh-spr2on
```

4. require both-file re-read verification and zero source-ID references;
5. confirm the canonical health Project contains 21 Content records;
6. confirm only one `건강정보` area remains;
7. confirm health GSC and NAVER appear only in the canonical health area;
8. confirm no health Connection card appears in art or finance areas;
9. create separate `brightjaetech.kr` GSC and finance NAVER Connections;
10. verify real Provider sync, Snapshot, Evidence and finance Opportunity Planning;
11. verify real YouTube, GA4 and AdSense flows separately.

Automated success does not replace local `.bright-studio` migration or real Provider verification.
