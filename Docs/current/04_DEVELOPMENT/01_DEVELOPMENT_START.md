# Bright Studio Current Development Start

## Documentation Baseline

Before implementation, read in this order:

1. `AGENTS.md`
2. `Docs/current/00_FOUNDATION/08_DECISION_LOG.md`
3. `Docs/current/00_FOUNDATION`
4. `Docs/current/01_PRODUCT`
5. `Docs/current/02_ARCHITECTURE`
6. Relevant `Docs/current/03_DESIGN` documents
7. `Docs/current/04_DEVELOPMENT`

The Decision Log is the highest Source of Truth. Architecture remains frozen unless a new approved Decision changes it.

## Confirmed Product Model

```text
Workspace
├── Brand (optional)
└── Project
    ├── optional Brand association
    └── Content
```

- Workspace is the user's independent working space.
- Project always belongs to one Workspace.
- Project may optionally reference one Brand in the same Workspace.
- Content always belongs to one Project.
- Brand is never a required prerequisite for Project creation.

## Completed Development Baseline

- Sprint 1: Platform and Content Foundation — Completed
- Sprint 2: Content Processing Engine — Completed
- Sprint 3: Product UI Foundation — Completed
- Sprint 4: Usable Content and Safe Draft Workflow — Implemented and automatically verified; real Tistory verification pending
- Sprint 5: Editorial Quality Pipeline — Completed
- Sprint 6: Presentation Architecture — Design Approved; detailed design and implementation pending

## Current Priority

Do not add a new Engine before the current real-use gate is verified.

```text
Workspace
→ Project
→ Natural-language Request
→ AI Planning
→ Content Generation
→ Editorial Quality Pipeline
→ Editor
→ Tistory Preview
→ Category Selection
→ Draft Save
→ Reopen and Verify Draft
```

The next environment-dependent task is a harmless real Tistory Draft Save that returns `saved`, with matching title, meaningful body, selected category when applicable, and proof that no public post was created.

## Next Design Milestone

Sprint 6 detailed design:

- Canonical Bright Components
- Renderer contracts
- Theme Skin tokens
- Component versioning
- Tistory presentation
- WordPress Bright Theme
- GeneratePress child-theme integration
- Accessible fallback behavior
- Acceptance criteria

Implementation requires Product Owner approval after the detailed design is complete.

## Development Workflow

```text
Understand
→ Plan
→ Approve
→ Implement
→ Test
→ Review
→ Commit
```

Never skip documentation review, automated verification, or the external-environment gate required by the workflow.
