# Decision Log

## Purpose

Record architectural and product decisions so they are never lost.

------------------------------------------------------------------------

## Decision #001

Title: Workspace is the Product

Status: Accepted

Reason: Users spend most of their time inside the Workspace, not on the
dashboard.

------------------------------------------------------------------------

## Decision #002

Title: Continue Working is the primary action

Status: Accepted

Reason: Users should always resume unfinished work without searching.

------------------------------------------------------------------------

## Decision #003

Title: Content Quality Above Everything Else

Status: Accepted

Reason: The value of Bright Studio comes from producing better content
than a generic AI chat.

------------------------------------------------------------------------

## Decision #004

Title: Personal Edition vs Commercial Edition

Status: Accepted

Reason: Personal Edition exposes quality scores and advanced tools.
Commercial Edition prioritizes simplicity.

------------------------------------------------------------------------

## Decision #005

Title: Workspace, Optional Brand, and Project-First Creation

Status: Accepted

Decision:

- Workspace and Brand are separate concepts.
- Workspace is the user's independent working space.
- Brand is optional and belongs to one Workspace.
- Project creation is the primary creation action after Workspace creation.
- Project name is required and brand name is optional.
- When a brand name is entered, an existing Brand with the same name in the current Workspace is reused; otherwise a Brand is created.
- A Project can be created without a Brand.
- Every Project always belongs to one Workspace and may optionally belong to one Brand.
- Every Content always belongs to one Project and never directly to a Workspace or Brand.

Reason: This records the originally intended Project-First product structure and corrects earlier documentation that incorrectly treated Workspace and Brand as the same concept. It does not make Brand creation a prerequisite and does not require Brand in the default Project route.
