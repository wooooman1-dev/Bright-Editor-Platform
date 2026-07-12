# Workspace Update

## Definitions

Workspace is the user's independent working space. Workspace and Brand are different concepts.

Brand is an optional project classification and operating context inside one Workspace.

Project is one goal that always belongs to a Workspace and may optionally be associated with one Brand.

Content is the actual deliverable. Content belongs only to a Project; Workspace and Brand do not directly own Content.

## Relationship

```text
Workspace
├── Brand (optional collection)
└── Project
    ├── optional Brand association
    └── Content
```

## Project-First Creation

```text
Workspace creation
→ Project creation
  - Project name: required
  - Brand name: optional
  - Description: optional
→ Content creation
```

If brand name is empty, the Project is created directly in the Workspace. If brand name is provided, reuse the matching Brand in the current Workspace or create it and associate the Project. Do not require a separate Brand creation step.

Never mix Workspace, Brand, Project, and Content.
