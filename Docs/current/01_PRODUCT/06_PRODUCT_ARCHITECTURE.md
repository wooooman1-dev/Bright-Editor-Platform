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

Settings is Workspace-scoped. It reads and changes operational state through existing server services. Publishing Accounts and credentials remain Workspace-owned; Projects and Contents store account IDs only. Platform Connections are prepared in Settings rather than during Content creation.

Enabled Platform is Workspace configuration and is separate from Platform Connection and Publishing Account state. The operational order is Enabled Platform → Platform Connection → Publishing Account. Disabled platforms and their accounts are excluded from user flows and readiness calculations, while existing credentials, sessions, accounts, and Project/Content references are preserved.

A Workspace with no persisted Enabled Platforms configuration enters Workspace onboarding before the normal Workspace. Completing onboarding stores the selection in the existing Workspace settings and routes to Platform Connections. Connection can be skipped; onboarding completion is not revoked by later Settings edits.

Quality remains a Core service over canonical `ContentDocument`; platform renderers and browser workflows do not calculate scores. Tistory category retrieval remains an App workflow reached through the existing Permission Gate, Publishing Service, and Tistory adapter. Content owns only safe publishing preparation references and never session or credential data.

## Workspace Principles

-   Workspace is the core experience.
-   Workspace is the user's independent working space, not a Brand.
-   Project creation requires a Workspace and does not require a Brand.
-   Continue Working is the primary action.
-   AI supports quietly.
-   Content quality has the highest priority.
-   Personal and Commercial editions share the same core architecture
    but different UX presentation.
