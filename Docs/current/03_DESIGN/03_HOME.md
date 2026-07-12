# Home Update

Home is a Launcher, not a Dashboard.

## States

### First Visit

- No Workspace exists.
- Show only the primary action to create a Workspace.
- Do not show Brand, Project, Content, Continue Working, or example fixture data.

### Empty Workspace

- A Workspace exists but no Project exists.
- Show the actual Workspace name.
- Make `New Project` the primary action.
- Do not require or promote Brand creation as a preceding step.

The Project form uses Project name (required), brand name (optional), and description (optional). Brand is resolved or created inside the current Workspace only when a brand name is provided.

### Working

- Show Continue Working only when an actual active Project exists.

### Power User

- Show recent Projects and expanded quick actions only when actual multiple Projects or Content exist.

### Publish Complete

- Use only when an actual publish-complete state exists.
- Do not use fixture data to force this state.

## Rules

- Header only
- No Sidebar
- State is derived from actual user data existence.
- Home must reveal the next required action within three seconds.
