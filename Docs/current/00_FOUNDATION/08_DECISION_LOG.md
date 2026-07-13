# Bright Studio Decision Log

> Single Source of Truth
>
> 이 문서는 Bright Studio의 최종 결정사항만 기록한다.
> 회의 내용은 기록하지 않는다.
> 승인된 내용만 기록한다.
>
> 우선순위
>
> Decision Log
> ↓
> AGENTS.md
> ↓
> PRD
> ↓
> Feature Spec
> ↓
> 기타 문서

---

# D-001 Platform First

Status
Accepted

Core는 Platform Independent로 개발한다.

Platform Adapter를 통해

Tistory
WordPress
YouTube
Naver Cafe

등을 지원한다.

---

# D-002 Workspace owns Connections

Status
Accepted

Publishing Account는 Workspace가 소유한다.

Credential은 Workspace 밖으로 절대 전달하지 않는다.

Project는 PublishingAccountId만 참조한다.

---

# D-003 Platform Connections

Status
Accepted

Platform Connections는

Workspace 메뉴가 아니라

Settings에서 관리한다.

사용자는 최초 설정 시 연결한다.

콘텐츠 생성 중에는 연결을 묻지 않는다.

---

# D-004 Content Creation

Status
Accepted

콘텐츠 생성은

카테고리 선택으로 시작하지 않는다.

사용자는

자연어만 입력한다.

예)

"50대를 위한 혈당 관리 글을 만들고 싶어"

AI는

- Domain
- Search Intent
- Keyword
- Audience
- Goal
- Platform

을 추천한다.

사용자는

추천 결과를 수정하거나 승인한다.

---

# D-005 Domain

Status
Accepted

Domain은

사용자가 먼저 선택하지 않는다.

AI가 추천한다.

사용자는 수정 가능하다.

---

# D-006 Quality Review

Status
Accepted

Generate 이후

AI는 자동으로

Quality Review를 수행한다.

사용자가

Run Quality Review

버튼을 누르지 않는다.

---

# D-007 Quality Goal

Status
Accepted

목표 점수

SEO

95+

Search Intent

95+

Readability

95+

Overall

95+

95점 미만이면

AI가 자동 수정한다.

재검토를 수행한다.

Editor는

목표 품질 도달 후 열린다.

---

# D-008 Quality Engine

Status
Accepted

Quality Engine은

체크리스트가 아니다.

실제 콘텐츠 품질을 평가한다.

평가 항목

- SEO
- Search Intent
- Readability
- Structure
- HTML
- Image Strategy
- Internal Links
- CTA

---

# D-009 User Edit

Status
Accepted

사용자가

본문을 수정하면

기존 Quality 승인은 무효화된다.

자동 재검토 대상이 된다.

---

# D-010 Publishing

Status
Accepted

기본 정책

Draft Only

Public Publish

기본 비활성화

---

# D-011 Playwright

Status
Accepted

Playwright는

직접 호출하지 않는다.

Permission Gate

↓

Publishing Service

↓

Platform Adapter

↓

Registered Workflow

↓

Playwright

---

# D-012 Tistory Category

Status
Accepted

Tistory Category는

콘텐츠 생성 전에 선택하지 않는다.

발행 준비 단계에서

실제 Tistory Category를 읽어

사용자가 선택한다.

---

# D-013 Personal First

Status
Accepted

Bright Studio는

개인용 제품을 먼저 완성한다.

상용 버전은

그 이후 확장한다.

---

# D-014 UX Philosophy

Status
Accepted

사용자는

최대한 적게 결정한다.

AI가

최대한 많이 결정한다.

사용자는

최종 승인만 수행한다.

---

# D-016 Settings Operational State

Status
Accepted

Settings는 Workspace 단위의 실제 운영 설정 화면이다.

- Platform Connections는 Settings에서 미리 관리한다.
- Overview 상태는 fixture가 아니라 실제 persistence, provider configuration, connection verification, browser capability에서 계산한다.
- Create Content는 자연어 입력으로 시작하며 Settings에서 준비된 Publishing Account ID만 참조한다.
- 플랫폼 내부 Category는 Publishing Preparation에서 조회하고 선택한다.
- Review First와 Draft Only가 기본이며 Public Publish는 비활성화한다.
- Credential, Cookie, Session, API Key 원문은 Workspace 밖이나 브라우저로 전달하지 않는다.

---

# D-015 Architecture

Status
Accepted

Architecture는

Epic 진행 중 변경하지 않는다.

변경이 필요하면

Decision Log를 수정한 뒤

문서를 수정한다.

구현은 마지막이다.

# D-016 Enabled Platforms

Status: Accepted

Workspace Settings에서 사용할 플랫폼을 먼저 선택한다.

지원 가능한 전체 플랫폼 목록 중 사용자가 활성화한 플랫폼만
Settings Overview, Platform Connections, Project, Content Creation,
Publishing Preparation에 표시한다.

플랫폼 활성화와 Publishing Account 연결 상태는 분리한다.

플랫폼 체크 해제는 기존 Credential이나 Publishing Account를
자동 삭제하지 않는다.

AI의 Platform Recommendation은 활성화된 플랫폼 범위 안에서만 수행한다.

# D-017 Enabled Platforms Onboarding

Status: Accepted

Workspace에 Enabled Platform 설정이 없으면
일반 Workspace 화면보다 먼저 플랫폼 선택 화면으로 유도한다.

사용자가 사용할 플랫폼을 직접 선택하기 전에는
임의의 플랫폼을 자동 활성화하지 않는다.

설정 완료 후 선택한 플랫폼만
Overview, Platform Connections, Project,
Content Creation, Publishing Preparation에 표시한다.

플랫폼 연결은 선택 이후 별도 단계이며,
연결 전에도 AI Planning과 Editor 사용은 가능하다.
Preview와 Draft Save는 준비 상태에 따라 제한한다.