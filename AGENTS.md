Decision Log(00_FOUNDATION/08_DECISION_LOG.md)는
프로젝트의 최상위 Source of Truth이다.

문서가 충돌하면 Decision Log를 따른다.

# Bright Editor Platform - AI Agent Rules (v2.4)

> This document is the mandatory operating manual for all AI coding agents.

## 1. Mission

Build Bright Editor Platform as an AI-powered Content Lifecycle Platform.

Never optimize for short-term convenience at the expense of long-term architecture.

## 2. Single Source of Truth

Before writing code, read:

1. Docs/current/00_FOUNDATION
2. Docs/current/01_PRODUCT
3. Docs/current/02_ARCHITECTURE
4. Docs/current/04_DEVELOPMENT (if present)

If documentation conflicts with code, documentation wins.

## 3. Forbidden Rules

Never:

- Modify `D:\tstory_auto`.
- Copy code from `D:\tstory_auto` into this project.
- Skip documentation review.
- Merge Core and Apps responsibilities.
- Hardcode API keys or secrets.
- Introduce unnecessary dependencies.
- Create large god files.
- Break existing functionality.
- Change architecture without approval.
- Generate low-quality Canvas thumbnail features.

When uncertain, stop and explain before coding.

## 4. Directory Ownership

- `Core/`: Platform-independent logic only.
- `Apps/`: Platform-specific implementations only.
- `Shared/`: Reusable utilities, UI, config, and types.
- `Docs/`: Documentation only.
- `Tests/`: Automated tests only.
- `Scripts/`: Build, migration, and utility scripts.

No directory may assume responsibilities of another.

## 5. File Creation Rules

Create new files only when justified.

Prefer one responsibility per file, small modules, clear names, and predictable locations.

Avoid duplicate utilities, duplicate models, and generic helper dumping grounds.

## 6. Refactoring Rules

Before refactoring:

1. Explain why.
2. Estimate impact.
3. Preserve behavior.
4. Test.
5. Report changed files.

Never refactor unrelated code.

## 7. Playwright Rules

Playwright responsibilities are divided by platform independence.

### Core browser automation

Shared browser lifecycle logic belongs in:

`core/automation/browser`

Allowed responsibilities:

- Browser launch and shutdown
- Browser context creation and cleanup
- Page creation
- Shared launch options
- Shared timeout policy
- Session storage primitives
- Browser-level logging and errors

Core browser modules must remain platform independent and must not contain platform URLs, selectors, login rules, editor behavior, or draft/publishing workflows.

### App browser automation

Platform-specific browser automation belongs inside its App directory, such as:

- `apps/tistory`
- `apps/wordpress`
- `apps/youtube`
- `apps/naver-cafe`

Allowed responsibilities:

- Platform URLs
- Login and session validation
- Page objects
- Stable selectors and locators
- Navigation workflows
- Editor operations
- Draft save workflows
- Platform-specific errors

Requirements:

- Stable locators
- Explicit state-based waits
- Reusable page objects where appropriate
- Clear logging
- Robust error handling
- No duplicated selectors
- No duplicated browser lifecycle logic across Apps

Target v0.1 workflow:

Browser → Login or Restore Session → Open Tistory Editor → Input HTML → Save Draft

Publishing is excluded from v0.1.

## 8. AI Provider Rules

Never call providers directly from business logic.

Use:

Core → AI Provider Interface → Provider Implementation

Supported providers:

- OpenAI
- Claude
- Gemini
- Ollama

Provider implementations must be interchangeable.

## 9. Code Quality Checklist

Every implementation should satisfy:

- Builds successfully
- No lint errors
- No obvious TypeScript errors
- Reusable
- Small functions
- Clear naming
- No duplicated logic
- Documentation updated if required
- Tested
- Existing features preserved

## 10. Commit Message Rules

Use Conventional Commits.

Examples:

- `feat: implement tistory draft workflow`
- `fix: resolve playwright login timeout`
- `docs: update browser automation architecture`

## 11. Completion Report

After every task report:

- Summary
- Files Added
- Files Modified
- Tests Performed
- Risks
- Next Recommended Step

## 12. Development Workflow

Always follow:

Understand → Plan → Implement → Test → Review → Commit

Never skip testing.

## 13. Long-term Vision

Current phase: Personal high-quality platform.

Future phase: Commercial SaaS.

Every decision should support both.

Platform First. Quality First. Maintainability First.

## 14. Shared AdSense Approval Preparation Rules

Before planning, generating, reviewing, rendering, or preparing a Draft for any Content whose purpose is `adsense_approval`, read:

`Docs/current/01_PRODUCT/15_ADSENSE_APPROVAL_MODE.md`

Then read:

`Docs/current/01_PRODUCT/17_ADSENSE_APPROVAL_READINESS_BLUEPRINT.md`

Then read the applicable Project profile document referenced by `approvalProfileId`.

Initial profiles:

- `wordpress_life_economy_v1` → `Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md`
- `tistory_vivarain_art_v1` → `Docs/current/01_PRODUCT/16_TISTORY_VIVARAIN_ADSENSE_APPROVAL_PROFILE.md`

Mandatory shared rules:

- The real product objective is to maximize verified AdSense approval readiness, not merely generate prose that looks approval-oriented.
- AdSense approval is never guaranteed.
- Project purpose, Content purpose, policy ID, policy version, profile ID, and profile version must remain durable across navigation and reload.
- Planning, Generation, and Quality Review must use the same stored policy snapshot.
- Existing Content without purpose metadata is read as `standard`.
- Approval preparation is not measured by article count, prose length, paragraph count, or Category count.
- Duplicate, thin, rewritten, placeholder, unsupported, exaggerated, or guarantee-style content is blocked.
- Generation remains one AI call and Quality Review remains one AI call.
- Review First and Draft Only remain enabled.
- Public publishing and scheduling remain disabled until separately approved.
- A valid canonical document that misses approval preparation policy remains preserved as `in_review` with actionable diagnostics.
- Tistory and WordPress use the same Core approval architecture. Do not create a weaker Tistory approval path or a separate WordPress-only quality model.
- Shared approval architecture must include Article Approval Gate, Evidence Verification, Duplicate Risk Check, and Site Approval Readiness Gate.
- A source label or the word `출처` is not evidence verification. Stored official Evidence and article claims must agree.
- Article quality score, including a score of 100, does not mean the site is ready for AdSense application.
- Standard Quality approval, approval-policy status, source verification, duplicate verification, internal-link diagnostics, and site readiness must be represented as separate states.
- Internal links are not forced when no qualified public candidate exists. Missing Category, unavailable catalog, eligible-candidate absence, placement failure, and successful placement must be distinguished.
- Site-wide readiness applies to both Tistory and WordPress, including navigation, trust pages, empty or broken surfaces, mobile readability, public accessibility, copyright safety, and topic-quality consistency.

Do not implement approval logic only inside one platform App. Shared purpose, policy snapshots, prompt context, Evidence contracts, duplicate checks, Quality Gate, and site-readiness rules belong in Core or platform-independent application services. Platform Apps own only their external Category, media, rendering, Draft save, crawler/platform checks, and external verification behavior.

## 15. WordPress AdSense Approval Rules

Before planning, generating, reviewing, rendering, or publishing WordPress AdSense approval content, read:

`Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md`

Mandatory initial baseline:

- Site identity: 생활경제
- Initial WordPress Category: `생활경제` only
- No initial Tags
- No empty Categories, Tags, menus, or public placeholder pages
- Initial content scope: government support, tax basics, housing systems, and basic personal-finance information grounded in official sources
- Investment recommendations, guaranteed returns, guaranteed loan approval, and unsupported benefit claims are excluded from approval-stage content
- Every changeable fact must have an official source, information date, and review date
- Article count and prose length are not approval Gates
- Generation remains one AI call and Quality Review remains one AI call
- Review First and Draft Only remain enabled
- Public publishing and scheduling remain disabled until separately approved
- WordPress Draft Save is not complete until the saved Draft is re-read and its title, meaningful body, Category, Featured Image when applicable, and Draft status are verified
- The new WordPress site must be designed approval-first from the beginning: working navigation, required trust pages, no empty archives, no broken pages, mobile readability, crawler accessibility, sitemap, HTTPS, and theme/plugin stability.
- Do not mark the site application-ready until Article Approval Gate, Evidence Verification, Duplicate Risk Check, and Site Approval Readiness Gate have all passed.

Do not claim that Bright Studio can guarantee AdSense approval. The product may only report internal readiness states defined by the policy documents.

## 16. Tistory AdSense Approval Rules

Tistory approval preparation uses the same shared readiness blueprint as WordPress.

Mandatory Tistory baseline:

- Apply the applicable Tistory approval profile, initially `tistory_vivarain_art_v1`.
- Verify official artwork or artist Evidence instead of checking only for source wording.
- Compare article facts with the stored Evidence Pack.
- Check existing Tistory public and canonical content for duplicate topic, intent, structure, claims, and repeated value.
- Resolve and diagnose Category, public-post catalog, eligible related-post candidates, contextual internal-link placement, and related-post placement.
- Do not force unrelated internal links or fill related-post slots with irrelevant content.
- Verify site navigation, Category structure, trust pages, mobile public rendering, accessibility, copyright and image-use safety, broken links, and topic-quality consistency.
- Do not mark Tistory application-ready because a single article has a standard Quality score of 100.

Tistory platform-managed infrastructure may reduce some technical work, but it does not remove the shared Article, Evidence, Duplicate, Internal Navigation, and Site Readiness obligations.
