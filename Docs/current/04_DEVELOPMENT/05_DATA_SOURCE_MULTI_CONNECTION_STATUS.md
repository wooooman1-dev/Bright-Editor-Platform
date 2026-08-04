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

The Workspace contains several existing Projects and Workspace-owned Data Source Connections. The first multi-connection UI reused one shared Project selector to render one shared assignment area. Changing that selector made every rendered card appear to belong to the newly selected Project, even though Project references are stored by the independent key `projectId:connectionId`.

The same UI also mislabeled an action as `새 Project 만들기` and routed to a real Project creation page. The intended behavior was to create a lower management area for an already existing Project, not to create new Project data.

A later local repair run reported that four invalid health-only Project references had been removed. A subsequent read-only inspection of the real `.bright-studio/intelligence/metadata.json` still showed the same health GSC and NAVER Connections actively referenced by all three Projects.

The repair function itself removed the intended records in memory, but the command treated a successful temporary-file rename as final success. It did not protect against a running Next.js development server, did not detect a metadata change immediately before replacement, and did not re-read the final file to prove that the persisted snapshot matched the intended result. Therefore the prior success log was not a durable-storage verification.

## Assignment repair durability fix

The repair command now applies the following gates before it may print success:

```text
1. Refuse to run while `.next/dev/lock` exists
2. Acquire an exclusive repair lock
3. Read the actual studio-data.json and metadata.json
4. Calculate invalid health-only references
5. Fingerprint metadata.json before backup and before replacement
6. Abort if another process changes the file
7. Create a timestamped backup
8. Replace metadata.json through the temporary file
9. Re-read the persisted metadata.json
10. Require exact equality with the intended repaired snapshot
11. Re-run the assignment classifier and require zero remaining invalid references
12. Report the final active Reference count only after verification
```

The command still preserves Connections, Snapshots, Evidence, credentials, Projects and Content data. The real local metadata remains externally unverified until the updated command is pulled, run with the development server stopped, and followed by the read-only Reference listing.

## Final ownership and UI decision

```text
Project = brand, topic, audience and content-strategy boundary
Platform Target = Tistory, WordPress, YouTube or Naver Cafe publishing destination inside a Project
DataSourceConnection = Workspace-owned site, channel, account resource or keyword-set connection
ProjectDataSourceReference = explicit Project use permission for one Connection
Project data source area = UI projection bound to one immutable existing Project ID
```

Current Workspace Projects are rendered as separate lower areas. A Project area independently calculates its assigned and available Connections from its own Project ID. Changing the top picker cannot rename, replace or rebind an existing area.

## Implemented

- removed the incorrect `/projects/new` flow introduced for Data Source Settings
- replaced `새 Project 만들기` with `선택한 Project 영역 만들기`
- the selector uses existing Workspace Projects only
- all current Projects render as independent areas by default
- an area can be hidden and re-added without deleting Project or Data Source records
- every area stores and renders its own Project ID
- every area calculates assigned and available Connections independently
- assignment actions send the Project ID of the area that rendered the card
- cards display the actual assigned Project names derived from Workspace references
- changing the top picker does not reload or rewrite Workspace references
- each Project area provides direct GSC and NAVER creation actions with that Project visibly preselected
- Provider-level explicit new Connection actions remain available
- multiple Search Console resources and NAVER keyword sets remain supported
- Google OAuth credential reuse remains reference-aware
- YouTube Analytics provider implementation remains included
- Project assignment repair refuses to run while the Next.js development server lock exists
- repair writes use a per-file exclusive repair lock and metadata fingerprint checks
- repair success requires persisted-file re-read and exact result verification
- file-level regression tests cover durable write, backup preservation, development-server refusal and false-success rejection

## Current external Evidence matching behavior

Opportunity Planning does not choose a Project only from its visible title.

The current deterministic sequence is:

```text
1. Current Project ID
2. Enabled ProjectDataSourceReference records for that Project
3. Enabled, non-disconnected Connections referenced by those records
4. Project term overlap with stored external Evidence
5. Candidate topic/keyword overlap with the remaining Evidence
```

The Project term set is built from:

- `project.name`
- `project.description`
- `project.strategy.primaryTopic`
- `project.strategy.subtopics`

The external Evidence side is built from:

- `evidence.keyword`
- `evidence.topic`
- `evidence.pageUrl`

Common words such as `관리`, `방법`, `가이드`, `정보`, `콘텐츠`, `글`, `프로젝트`, `위한`, `대한` are ignored. Terms are normalized and matched by partial overlap.

After that Project-level filter, each generated candidate is matched again using:

- `candidate.selectedTopic`
- `candidate.primaryKeyword`
- `candidate.secondaryKeywords`

Therefore an assigned Connection alone is not enough. Its Evidence must also overlap the Project strategy and then the candidate topic/keywords.

## Automated verification

Independent Project area implementation commits:

```text
537377b  fix: render independent project data source areas
5da311b  fix: remove incorrect project creation flow from data sources
2887985  test: cover independent project data source areas
f6795cd  fix: avoid synchronizing project sections in an effect
89efa4f  docs: record independent project areas and evidence matching
02eb2e8  docs: record independent project area CI success
```

Assignment repair durability commits:

```text
86b3239  fix: verify project assignment repair persistence
1491d4a  test: cover durable project assignment repair
```

Previous verified HEAD:

```text
Commit: a7d0c6ad9b08a836bf931acaef1af0a05fe00a4d
Run: 30892994324
Job: 91939223421
Conclusion: success
```

That successful job passed:

- TypeScript typecheck
- ESLint zero-warning gate
- complete non-E2E Vitest suite
- Next.js production build

The assignment repair durability commits require a new CI result. Automated success does not replace local metadata and real Provider verification.

## Not externally verified

The following remain real-environment gates:

- pull the assignment repair durability commits into the local feature branch
- stop the Next.js development server before running the repair command
- run `npm run data-sources:repair-project-assignments`
- require the command to print `metadata.json 재읽기 검증을 통과했습니다.`
- re-read the actual metadata and confirm only the two health Project References remain for the existing health GSC and NAVER Connections
- three existing Projects render as three independent lower areas
- changing the top picker leaves all existing area identities unchanged
- the actual assigned Project names stay identical on a Connection card in every area
- assigning or excluding a Connection in one area changes only that Project reference
- existing health GSC and NAVER Connections remain unchanged
- `brightjaetech.kr` Search Console Connection creation
- finance NAVER keyword-set Connection creation
- correct finance Project assignment and synchronization
- Content Opportunity rerun using finance external Evidence
- real YouTube OAuth, channel selection, Snapshot and Evidence creation
- GA4 and AdSense real-account verification

No publishing, WordPress Draft save or public write is part of this verification.
