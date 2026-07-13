# Project Model

## Relationship Model

```text
Workspace
├── Brand (optional collection)
└── Project
    ├── optional Brand association
    ├── Content
    ├── Project Profile
    ├── AI Profile
    ├── Platform Settings
    ├── Content Assets
    ├── Activity Timeline
    ├── Version History
    └── Analytics
```

## Ownership Rules

- Workspace is the user's independent working space.
- Brand belongs to exactly one Workspace and is optional.
- Project belongs to exactly one Workspace.
- Project may belong to zero or one Brand in the same Workspace.
- Content belongs to exactly one Project.
- Workspace and Brand do not directly own Content.

```text
Brand.workspaceId = required
Project.workspaceId = required
Project.brandId = optional
Content.projectId = required
```

If a Project has a Brand association, `Project.workspaceId` remains required and must match `Brand.workspaceId`.

## Creation Policy

The required flow is Workspace creation → Project creation → Content creation. Project name is required; brand name is optional. A provided brand name reuses the matching Brand inside the current Workspace or creates it before association. Brand creation is not a separate prerequisite.

## Route Principle

The default Project route remains Workspace-scoped:

```text
/workspaces/[workspaceId]/projects/[projectId]
```

Brand association does not require `brandId` in the default Project route. A future Brand management or filtering screen may be added separately, but it must not become a prerequisite for Project creation.

## Content Creation Metadata

Content is created after plan confirmation and before final generation. It persists Workspace and Project ownership, optional Brand reference, natural-language request, interpreted intent, domain, primary and related keywords, search intent, audience, goal, content type, Publishing Account references, status, creation method, and timestamps.

Generated or revised output is stored as the canonical `ContentDocument`. Rendered platform HTML is derived output and is never the only source of truth. Generation retries update the same Content ID.

Project default publishing targets and Content targets contain only Workspace-owned `PlatformConnection` IDs. They never contain credentials, cookies, session paths, or copied secrets.
