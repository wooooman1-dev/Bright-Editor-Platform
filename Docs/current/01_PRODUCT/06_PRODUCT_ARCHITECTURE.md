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

## Presentation Layer

Bright Studio separates content generation from visual presentation.

The platform owns the presentation layer instead of depending on
feature-heavy WordPress themes.

## Base Theme

For WordPress, Bright Studio standardizes on a lightweight base theme.

The current standard is:

- GeneratePress

The base theme is responsible only for:

- Header
- Footer
- Navigation
- Sidebar
- Archive
- Search

It should not own article presentation.

## Bright Theme

Bright Theme is Bright Studio's presentation implementation.

It provides reusable presentation components shared across supported platforms.

Reusable components include:

- CTA
- Callout
- Card
- Checklist
- Comparison Table
- FAQ
- Notice
- Warning
- Related Posts
- Table of Contents

These components are generated and rendered by Bright Studio.

The presentation layer belongs to Bright Studio, allowing the base theme
to be replaced without affecting generated content.

Bright Components are platform-independent.

They are the canonical presentation model used by Bright Studio.

The same component definitions are shared across all supported platforms.

Platform adapters are responsible only for rendering those components into each platform's native format.

Presentation belongs to Bright Studio, not to the publishing platform.


## Theme Skins

Different projects reuse the same component system while applying different visual skins.

Examples:

- Health
- Finance
- News
- Shopping

Skins change only visual appearance.

They must not change the underlying component structure or generated HTML.

A skin changes:

- Colors
- Typography
- Buttons
- Cards
- Icons

without changing the underlying HTML structure.

## Development Rules

Never modify the base theme directly.

Base theme updates should remain independently installable without requiring changes to Bright Theme.

Customization must be implemented through:

- Child Theme
- CSS
- Hooks
- Bright Components

Generated content must never depend on theme-specific HTML structures.

Platform adapters may adapt generated content to platform-specific formats, but they must preserve the semantic structure defined by Bright Components.
