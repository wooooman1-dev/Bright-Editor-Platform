# 03_USER_FLOW.md (최신 수정본)

## Bright Studio Content Creation Flow (Final)

### 핵심 원칙

-   콘텐츠 생성은 자연어 입력으로 시작한다.
-   AI가 Domain, Search Intent, Keyword, Audience, Goal, Platform을
    추천한다.
-   사용자는 AI 추천을 수정하거나 승인할 수 있다.
-   콘텐츠 생성 후 AI가 자동으로 Quality Review를 수행한다.
-   목표 품질(95점 이상)에 도달한 뒤 Editor를 연다.
-   사용자가 수정하면 기존 품질 승인은 무효화되고 자동 재검토 대상이
    된다.
-   Project는 Publishing Account만 참조한다.
-   플랫폼 내부 카테고리(Tistory 등)는 발행 준비 단계에서 선택한다.
-   Draft Only가 기본 정책이며 Public Publish는 기본 비활성화한다.

## 최종 Workflow

Workspace → Platform Connections → Project → 자연어 입력 → AI Planning →
사용자 확인 → Content Generation → 자동 Quality Review → (필요 시 AI
자동 수정 및 재검토) → Editor → Preview → 플랫폼 카테고리 선택 → Draft
Save

## Publishing Preparation and review detail

For a connected and verified Tistory account, Publishing Preparation reads real categories through `category.read`, the Publishing Service, the Tistory adapter, the registered category workflow, and the stored session. The user selects a category ID or explicitly selects uncategorized. The account ID, category ID, and category name are stored with the Content and reused for both Preview and Draft Save.

The Editor derives character, paragraph, heading, word-unit, and reading-time metrics from canonical block text. Quality Review displays the weighted overall score, ten dimension scores, primary reasons, tasks, review time, and reviewed revision. Editing invalidates the displayed approval.

## Workspace Settings Integration

When Enabled Platforms has never been configured, Workspace entry first shows Workspace platform onboarding. The user selects at least one platform, continues to Settings → Platform Connections, and may connect an account or Skip for now. Skipping connection still allows Project, AI Planning, Content creation, Editor, and Quality Review; Preview and Draft Save remain readiness-gated.

Enabled Platforms is configured before Platform Connections. Only enabled platforms appear in Overview, connection management, Project targets, Content creation, AI recommendations, and Publishing Preparation. Disabling a platform preserves its Publishing Accounts, credentials, sessions, and existing Project/Content references so they reappear when enabled again.

Workspace → Settings의 Platform Connections → Project → 자연어 입력 순서로 준비한다.

Settings는 Workspace 단위로 AI, 플랫폼 연결, Draft Only 발행 정책, 자동화 준비 상태, 백업과 삭제를 관리한다. 연결된 계정이 없어도 Planning, Content 생성과 Editor는 사용할 수 있으며 Preview와 외부 Draft Save만 준비 상태에 따라 제한된다. Tistory Category는 Publishing Preparation에서 조회하고 선택한다.
