
# Bright Studio Product Requirements Document (PRD)

Version: 1.0 (Draft)

---

# 1. Product Overview

## Vision

Bright Studio는 AI Writer가 아니다.

Bright Studio는 **AI Content Operating System**이다.

사용자는 콘텐츠 자체에만 집중하고, 플랫폼은 콘텐츠의 기획, 생성, 검수, 발행, 운영까지 전체 라이프사이클을 관리한다.

---

# 2. Mission

> "사용자가 매일 가장 먼저 실행하는 콘텐츠 운영 도구"

Bright Studio의 성공 기준은 기능 개수가 아니라 결과물의 품질이다.

---

# 3. Product Principles

## 3.1 Content Quality Above Everything Else

새로운 기능보다 콘텐츠 품질을 우선한다.

기능 추가 시 반드시 다음 질문을 통과해야 한다.

- 콘텐츠 품질이 향상되는가?
- 독자의 만족도가 높아지는가?
- 검색 의도 충족률이 올라가는가?

통과하지 못하면 구현하지 않는다.

## 3.2 Project First

모든 데이터는 Project 단위로 관리한다.

Workspace는 Project의 현재 상태를 항상 복원해야 한다.

## 3.2.1 Workspace, Optional Brand, and Project Ownership

- Workspace is the user's independent working space, not a Brand.
- A Workspace can contain multiple Brands and multiple Projects.
- Brand is optional and belongs to one Workspace.
- Project always belongs to one Workspace and may optionally be associated with one Brand.
- Content always belongs to one Project. Workspace and Brand do not directly own Content.
- Brand creation is not a required step before Project creation.

Project creation fields:

- Project name: required
- Brand name: optional
- Project description: optional

When the optional brand name is empty, the Project is created directly in the Workspace. When it is provided, Bright Studio reuses the matching Brand in the current Workspace or creates it and associates the Project with it.

## 3.3 Continue Working

사용자는 작업을 기억할 필요가 없다.

Bright Studio는 다음을 기억한다.

- 현재 단계
- 마지막 편집 위치
- 미완료 작업
- 추천 다음 작업

## 3.4 Never Make Users Think

기능을 찾게 만들지 않는다.

필요한 순간 필요한 기능만 노출한다.

---

# 4. Target Users

## Personal Edition

대상

- 전문 블로거
- 콘텐츠 크리에이터
- SEO 사용자
- AI 활용 전문가

노출 기능

- Quality Score
- SEO Score
- AI Reasoning
- 상세 진단
- 고급 설정

## Commercial Edition

대상

- 일반 사용자
- 소상공인
- 마케팅 입문자

노출 기능

- AI 자동 생성
- 최소 설정
- Smart Default
- 점수 기본 숨김

---

# 5. Core Workflow

Home

↓

Projects

↓

Workspace

↓

Editor

↓

Quality Review

↓

Publishing

↓

Insights

모든 기능은 이 흐름을 방해해서는 안 된다.

---

# 6. Workspace Goals

Workspace는 제품 그 자체이다.

Workspace에서 사용자는

- 글 작성
- 이미지 확인
- 품질 확인
- AI 제안
- 발행

까지 완료해야 한다.

다른 화면 이동을 최소화한다.

---

# 7. Functional Requirements

## Project

- 생성
- 복제
- 보관
- 검색
- 즐겨찾기

## Editor

- Markdown
- Rich Text
- HTML Preview
- AI Rewrite
- AI Expand
- AI Compress

## Quality Engine

실시간 표시

- SEO
- Readability
- Structure
- Search Intent
- Internal Link
- Image Coverage

## Publishing

지원 플랫폼

- Tistory
- WordPress
- Naver Cafe
- YouTube (Future)

---

# 8. Non Functional Requirements

성능

- Editor 입력 지연 100ms 이하
- 자동 저장 5초 이하
- Workspace 복원 즉시

확장성

- Platform First
- Domain Independent
- Agent Ready

---

# 9. Success Metrics

콘텐츠 품질

95+

SEO

95+

Search Intent

95+

Readability

95+

Workspace Completion Rate

90%+

---

# 10. Out of Scope (v1)

제외 기능

- 팀 협업
- 실시간 공동 편집
- Marketplace
- Plugin Store

---

# 11. Future Roadmap

v1

- 개인용 콘텐츠 운영

v2

- 협업

v3

- AI Team

v4

- Marketplace

---

# 12. Definition of Success

사용자는 Bright Studio를 사용한 뒤 다음과 같이 느껴야 한다.

- 결과물이 더 좋아졌다.
- 작업 속도가 빨라졌다.
- 어디까지 했는지 기억할 필요가 없다.
- 다른 AI 도구보다 콘텐츠 품질이 높다.

이 네 가지가 충족될 때 Bright Studio의 목표를 달성한 것으로 본다.
