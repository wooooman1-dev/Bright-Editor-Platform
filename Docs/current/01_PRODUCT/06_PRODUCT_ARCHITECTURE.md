# Product Architecture

## Product Model

Bright Studio → Workspace → Project → Content → Publishing → Insights

Optional Brand association:

```text
Workspace
├── Brand (optional collection)
└── Project
    ├── optional Brand association
    └── Content
```

Ownership rules:

- `Brand.workspaceId` is required.
- `Project.workspaceId` is required.
- `Project.brandId` is optional.
- `Content.projectId` is required.
- A Project associated with a Brand still keeps its direct Workspace ownership.
- Workspace and Brand never directly own Content.

Creation is Project First: Workspace creation → Project creation → Content creation. Brand is handled optionally during Project creation and is never a required preceding screen.

## Navigation

-   Home
-   Projects
-   Publishing
-   Insights
-   Settings

Most work happens inside the Project Workspace.

## Workspace Principles

-   Workspace is the core experience.
-   Workspace is the user's independent working space, not a Brand.
-   Project creation requires a Workspace and does not require a Brand.
-   Continue Working is the primary action.
-   AI supports quietly.
-   Content quality has the highest priority.
-   Personal and Commercial editions share the same core architecture
    but different UX presentation.
