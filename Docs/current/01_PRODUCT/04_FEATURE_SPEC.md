# 04_FEATURE_SPEC.md 수정안

## Feature 관리 구조

Roadmap

↓

Epic

↓

Feature

↓

Task

↓

Commit

------------------------------------------------------------------------

## Epic 예시

### Browser Core

-   Browser Lifecycle
-   Session
-   Context

### Platform Integration

-   URL Configuration
-   Login Foundation
-   Login Navigation
-   Stored Session Context

### Publishing

-   Draft
-   Schedule
-   Publish

### AI

-   Writer
-   SEO
-   Review
-   Image
-   Video

### Developer Experience

-   Developer Dashboard
-   Developer Console

### Content Start and Review

- Natural-language planning through one AIProvider request
- Editable structured recommendation with explicit AI-estimate disclosure
- Manual fallback and durable pre-generation Content creation
- One editorial generation request, one final editorial review, and up to three automatic manuscript-improvement requests driven by the unchanged Rule Quality report
- Canonical ContentDocument editing, autosave, revision history, and AI-assisted revision
- Actionable repeatable Quality Review with Review First publishing policy
- The Editor opens with the first approved 95+ result, or with the highest-scoring manuscript after the third automatic improvement; users do not manually rerun generation to reach the target

### Safe Draft Publishing

- Workspace Publishing Account selection by reference only
- Exact TistoryHtmlRenderer preview in sandboxed iframe, mobile/desktop/raw modes
- Server-side permission gate and registered Tistory draft workflow
- Structured saved / partially_verified / failed verification result
- Project and Workspace backup-first deletion with exact-name confirmation

### Editor Quality and Tistory Preparation

- Real Tistory category retrieval with hierarchy, refresh, explicit uncategorized selection, server-validated persistence, and selected-ID reuse during draft save
- Stored-session expiry and safe category failure/reconnect states without credential or filesystem-path exposure
- Server-calculated ten-dimension Quality Review with canonical weights and content-type-aware length profiles
- Revision-bound persisted approval; manual edits invalidate previous approval
- Korean labels, dimension scores, reasons, actionable tasks, review time, and reviewed revision in the Editor
- Live canonical-text metrics: characters with/without spaces, Korean characters, mixed-language word units, paragraphs, headings, and reading time
- Reading time: 500 Korean syllables/minute plus 200 Latin/number words/minute, rounded up to at least one minute for non-empty text

### Workspace Settings

- First-run Workspace onboarding is required only while Enabled Platforms has never been configured; it requires at least one platform and continues to Settings → Platform Connections
- Platform connection remains optional during onboarding, and Skip for now unlocks normal Workspace use without relaxing Preview or Draft Save readiness rules
- Workspace-scoped Enabled Platforms checkboxes for Tistory, WordPress, YouTube, and Naver Cafe
- Enabled Platform state is distinct from connection state and filters Overview, connections, Project/Content targets, AI recommendations, and publishing readiness without deleting account data
- Live Overview calculated from persisted Workspace, provider configuration, connection verification, and browser capability
- OpenAI environment configuration status without exposing API keys
- Workspace-owned Tistory and WordPress account management with secret-free responses
- Review First, Draft Only, Public Publish off, and sequential draft-save defaults
- Browser/Chromium/registered Tistory worker readiness checks without direct UI Playwright control
- Workspace rename, versioned manual backup, persisted theme, and existing backup-first Danger Zone
