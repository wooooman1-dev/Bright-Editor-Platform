# Development Start (Sprint 3)

## Documentation Alignment

The confirmed product model is Workspace → Project → Content with an optional Brand association on Project.

- Workspace is the user's independent working space, not a Brand.
- Project always belongs to one Workspace.
- Project may optionally belong to one Brand in the same Workspace.
- Content always belongs to one Project.
- Required first-run flow: Workspace creation → Project creation → Content creation.
- Brand name is optional during Project creation; Brand creation is not a separate prerequisite.

The current Sprint 3 UI was implemented from earlier documentation that conflated Workspace and Brand and used default user-facing fixtures. A separate first-run stabilization implementation is required after this documentation alignment. This records the target model, not completed Brand management functionality.

## Current Sprint
Sprint 3

## Workflow

Documentation
↓

Implementation
↓

Test
↓

Commit
↓

Next Feature

## First Feature

Feature #1 - Home Layout Foundation

Before implementation, review:

- 03_DESIGN/02_NAVIGATION.md
- 03_DESIGN/03_HOME.md
- 03_DESIGN/04_WORKSPACE.md
- 03_DESIGN/09_UI_COMPONENTS.md
