# Bright Editor Platform - Implementation Feature Plan

## Purpose

This document tracks exact implementation units using the required sequence:

```text
Implement -> Test -> Review -> Commit
```

Feature numbering in this document is independent from the Phase 0-8 product roadmap in `Docs/current/01_PRODUCT/02_ROADMAP.md`.

Only one feature may be implemented at a time. Product scope and architecture remain governed by the other documents under `Docs/current`.

---

## Implementation Sequence

### Feature #1 - Establish Development Context

Status: Completed

Commit: `8b7e3c5 docs: establish development context`

### Feature #2 - Initialize Next.js Application

Status: Completed

Commit: `0644dff feat: initialize nextjs application`

### Feature #3 - Define Shared Browser Automation Architecture

Status: Completed

Commit: `257e606 docs: define shared browser automation architecture`

### Feature #4 - Add Chromium Browser Lifecycle

Status: Completed

Commit: `4d240a8 feat: add chromium browser lifecycle`

### Feature #5 - Add Browser Session Storage and Context Management

Status: Completed

Commits:

- `82f8357 feat: add browser session storage manager`
- `3dd3054 feat: add browser context manager`

### Feature #6 - Add Tistory Application Skeleton and Tistory URL Configuration

Status: Completed

Commits:

- `e6abad0 feat: create tistory application skeleton`
- `a9a1569 feat: add tistory url configuration`

---

## Feature #7 - Add Tistory Login Page Foundation

Status: Completed

Commit: `c2cdc0d feat: add tistory login page foundation`

### Purpose

Establish the minimum platform-specific login-entry Page Object boundary without implementing login behavior.

The current documentation does not confirm that the Tistory login entry exposes a direct account and password form. Selectors must therefore remain generic to the documented login entry and must not invent unsupported form elements.

### Scope

- Add platform-specific Tistory login-entry selectors under `apps/tistory/selectors`.
- Add a minimal Tistory login Page Object foundation under `apps/tistory/pages`.
- Keep selector definitions separate from the Page Object.
- Represent only currently required login-entry controls:
  - Account or email input, when applicable to the documented login entry.
  - Password input, when applicable.
  - Login or continue button.
- Allow the Page Object to receive a Playwright `Page` dependency without launching a browser.
- Export only the required public API through `apps/tistory/index.ts`.
- Add automated unit tests that require no external network access.
- Preserve existing behavior and leave the Core Browser Layer unchanged.

### Exclusions

- Browser launch
- Browser navigation
- Real Tistory network access
- Credential loading or credential entry
- Actual login execution
- Kakao login automation
- Login success or failure detection
- Session restoration
- Cookie handling
- Storage-state validation
- Editor navigation
- HTML input
- Draft saving
- Publishing

### Acceptance Criteria

- Login selectors are defined in `apps/tistory`, never in Core.
- Selector definitions are not mixed into workflows.
- A minimal Page Object accepts the appropriate Playwright `Page` dependency without launching a browser.
- The Page Object exposes only approved login-entry elements or locator access required by repository conventions.
- Existing Core Browser Layer files remain unchanged.
- Unit tests verify selector and Page Object behavior without network access.
- Typecheck, lint, tests, and build pass.
- The feature is reviewed and committed independently before Feature #8 begins.

---

## Feature #8 - Add Developer Dashboard

Status: Completed

Implementation Commit: `912cabb feat: add developer dashboard`

UI Redesign Commit: `3a277b6 style: redesign developer dashboard`

### Purpose

Add a development-only web verification page at `/dev` while keeping it separate from the production user interface.

### Scope

- Add the development-only `/dev` route.
- Display Bright Editor Platform development status.
- Display completed Core Browser Layer modules.
- Display available application modules.
- Provide a small Tistory URL Builder verification form.
- Reuse the existing `createTistoryUrls` implementation.
- Keep the initial dashboard minimal and separate from production UI features.

### Exclusions

- Playwright execution
- Browser navigation
- Login
- Credentials
- Cookie or storage-state validation
- Editor input
- Draft saving
- Publishing
- Production dashboard features

### Acceptance Criteria

- `/dev` renders successfully.
- The page is clearly marked development-only.
- Completed Core Browser Layer modules are visible.
- Tistory application status is visible.
- Valid Tistory blog identifiers generate login, admin, and editor URLs.
- Invalid identifiers display a safe validation error.
- Existing `createTistoryUrls` logic is reused.
- No external network access is required.
- Automated tests are included.
- Typecheck, lint, tests, and build pass.

---

## Feature #9 - Add Tistory Login Entry Navigation

Status: Completed

Implementation Commit: `ef7c029 feat: add tistory login entry navigation`

### Purpose

Add the smallest Tistory-specific workflow that navigates an injected Playwright `Page` to the existing Tistory login entry and verifies that the expected login-entry screen is available.

### Scope

- Add a login-entry navigation workflow under `apps/tistory/workflows`.
- Accept an injected Playwright `Page` without launching a browser or creating a browser context.
- Accept the Tistory blog identifier required by the existing URL API.
- Reuse `createTistoryUrls` to obtain the existing login URL.
- Navigate with a clear finite wait strategy and no arbitrary sleeps or `networkidle` dependency.
- Reuse `TistoryLoginPage` to wait for and verify the minimum approved login-entry element.
- Return a small predictable result on success.
- Throw a small Tistory-specific error with predictable messages on failure.
- Export the public workflow API through `apps/tistory/index.ts`.
- Add automated unit tests with mocked Playwright dependencies and no external network access.
- Preserve existing behavior and leave the Core Browser Layer unchanged.

### Architecture Ownership

- Workflow orchestration: `apps/tistory/workflows`
- Tistory URLs: `apps/tistory/config`
- Tistory selectors: `apps/tistory/selectors`
- Tistory Page Objects: `apps/tistory/pages`
- Browser lifecycle and context ownership: unchanged in `core/automation/browser`

### Exclusions

- Browser launch or browser context creation
- Environment variables, credentials, or credential entry
- Kakao login or account lookup clicks
- Login execution or login-success detection
- Cookie saving, session restoration, or storage-state validation
- Blog administration or editor navigation
- HTML input, draft saving, or publishing
- Developer Dashboard controls
- External dependencies
- Core Browser Layer changes
- Real external network access in automated tests

### Acceptance Criteria

- The workflow uses the login URL returned by the existing `createTistoryUrls` implementation.
- The injected `Page` is navigated with an explicit finite timeout and state-based wait.
- Login-entry availability is verified through `TistoryLoginPage` without duplicating selectors.
- Success returns a small predictable result containing the generated login URL.
- Navigation and missing login-entry failures produce predictable Tistory-specific errors.
- Tests mock the injected `Page` and required locator behavior without external network access.
- Existing tests continue to pass.
- Typecheck, lint, tests, build, and `git diff --check` pass.
- Core Browser Layer files remain unchanged.

---

## Feature #10 - Tistory Stored Session Context Preparation

Status: Completed

Commit: `ee8947e feat: add tistory stored session context`

### Purpose

Add a Tistory application-level coordinator that applies Tistory stored-session preparation policy while reusing the existing platform-independent Core browser capabilities.

### Scope

- Add a stored-session context preparation workflow under `apps/tistory/workflows`.
- Accept explicitly injected dependencies consistent with repository conventions.
- Require the caller to provide the storage-state path explicitly.
- Use the existing `BrowserSessionManager` for path validation and storage-state file existence checks.
- If the storage-state file is missing, do not request context creation and return a small immutable result that clearly indicates `missing` with no context.
- If the storage-state file exists, use the existing `BrowserContextManager` to prepare a context with the stored state.
- Return a small immutable result that clearly indicates `prepared` and contains the prepared `BrowserContext` unchanged.
- Leave ownership of closing the returned context with the caller.
- Normalize Core failures into the smallest repository-consistent Tistory workflow error only when needed.
- Export the public workflow API through `apps/tistory/index.ts`.
- Add automated unit tests with no Chromium process or external network access.
- Preserve all existing behavior and leave the Core Browser Layer unchanged.

### Architecture Ownership

- Tistory session-preparation policy and coordinator: `apps/tistory/workflows`
- Storage-state path validation and file existence checks: existing `BrowserSessionManager`
- BrowserContext creation and stored-state loading: existing `BrowserContextManager`
- Browser lifecycle: Core Browser Layer
- Authentication validity verification: separate future `apps/tistory` feature
- Returned BrowserContext shutdown: caller

### Policy Decisions

- The caller explicitly supplies the storage-state path; no environment-variable loading or default real-user path is introduced.
- A missing storage-state file produces a predictable immutable `missing` result and no BrowserContext is created.
- An available storage-state file is passed through the existing Core managers to prepare a BrowserContext.
- The presence or successful loading of storage state does not prove that Tistory considers the session authenticated or valid.
- The workflow does not close the returned BrowserContext automatically.

### Exclusions

- Direct browser launch or Chromium control in the Tistory coordinator
- Chromium execution or external network access in automated tests
- Tistory navigation, including login-entry, administration, or editor navigation
- Credential loading, credential entry, Kakao authentication, or login execution
- Session validity or authentication verification
- Manual cookie inspection or storage-state contents parsing
- Environment-variable loading or a default real-user storage path
- Automatic BrowserContext closing
- HTML input, draft saving, or publishing
- Core Browser Layer changes
- Developer Dashboard controls
- External dependencies

### Acceptance Criteria

- The storage-state path is explicitly supplied by the caller.
- Path validation and file existence checks use the existing `BrowserSessionManager` rather than duplicated file logic.
- A missing storage-state file returns an immutable `missing` result with no context and does not request context creation.
- An available storage-state file requests context preparation through the existing `BrowserContextManager`.
- A prepared result is immutable and returns the created BrowserContext unchanged.
- Neither result implies that the Tistory session is authenticated or valid.
- The workflow does not close the returned context; shutdown remains the caller's responsibility.
- Unit tests verify Core coordination through mocks without launching Chromium or accessing the network.
- Core failures are handled predictably if workflow-level error normalization is implemented.
- The public workflow API is exported through `apps/tistory/index.ts`.
- Existing tests continue to pass.
- Typecheck, lint, tests, build, and `git diff --check` pass.
- Core Browser Layer files remain unchanged.

---

## Current Development State

Completed through: Feature #10

Immediate next implementation unit: Not yet approved

Feature #11 must be explicitly approved before implementation begins.
