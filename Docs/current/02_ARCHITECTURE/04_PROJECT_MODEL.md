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

A resumable Planning Content is created when analysis is requested, before the provider call. Its Workspace, Project, and Content binding owns the durable request, workflow status, candidate snapshot, selected candidate ID, operation ID, and revision. Content Opportunity confirmation still occurs before final generation. Planning candidates are complete opportunities rather than independent keyword strings. A confirmed Opportunity atomically snapshots source request, automatic or user-specified selection mode, selected topic, primary and secondary keywords, search intent, audience, content type, angle, reader problem, expected coverage, rationale, evidence source, confidence, cautions, Project identity, Content identity, version, and deterministic fingerprint. `Content.primaryKeyword`, related keywords, search intent, audience, goal, and content type are compatibility mirrors of that immutable snapshot and may not be assembled from different candidates.

Generation is rejected before the provider call unless Workspace, Project, Content, opportunity ID/version/fingerprint, selected topic, primary keyword, search intent, and secondary keyword list match the stored confirmed snapshot. The server constructs AI context only from the stored Opportunity. Every AI-produced document passes deterministic Opportunity alignment before SEO placement: title correction is permitted only when topic, headings, body, and intent are aligned and the title alone omitted the exact phrase. Cross-topic manuscripts are not repaired by keyword prefixing and cannot pass Quality or Publishing gates. User-authored title edits remain explicit user changes.

Generated or revised output is stored as the canonical `ContentDocument`. Rendered platform HTML is derived output and is never the only source of truth. Generation retries update the same Content ID.

Project default publishing targets and Content targets contain only Workspace-owned `PlatformConnection` IDs. They never contain credentials, cookies, session paths, or copied secrets.
