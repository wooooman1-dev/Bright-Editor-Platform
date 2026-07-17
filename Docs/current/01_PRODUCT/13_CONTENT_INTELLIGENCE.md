# 13. Content Intelligence

Version: 1.0
Status: Draft
Sprint: Sprint 7
Owner: Core Platform

---

# 1. Purpose

Content Intelligence는 Bright Studio의 핵심 지식 계층(Core Knowledge Layer)이다.

Bright Studio는 단순히 AI가 글을 생성하는 플랫폼이 아니라,
프로젝트의 전략, 발행 이력, 검색 의도, 키워드, 품질 결과를
지속적으로 축적하여 시간이 지날수록 더 똑똑해지는 AI Content Operating System을 목표로 한다.

Content Intelligence는 이러한 지식을 관리하고,
AI가 항상 동일한 방향성과 품질을 유지하도록 만드는 핵심 시스템이다.

---

# 2. Goals

Sprint 7의 목표는 다음과 같다.

- Project DNA 관리
- Content Library 구축
- Published Registry 구축
- Search Intent Memory 구축
- Keyword Memory 구축
- Related Content Recommendation
- Internal Link Intelligence
- Duplicate Content Detection
- AI Context Builder
- Quality History 관리

---

# 3. Design Principles

## Knowledge Never Dies

사용자의 지식은 삭제하지 않는다.
삭제 시에도 Archive 상태로 유지한다.

## AI Uses Memory First

AI는 항상 기존 지식을 우선 활용한다.

새로운 내용을 생성하는 것은 마지막 선택이다.

## Recommendation First

AI는 가능한 모든 항목을 추천한다.

- 제목
- 키워드
- CTA
- 내부 링크
- 관련 글
- FAQ
- 이미지 전략

사용자는 승인만 수행한다.

## Platform Independent

Content Intelligence는

- Tistory
- WordPress
- YouTube
- Naver Cafe
- Shopping

모든 플랫폼에서 공통으로 사용된다.

---

# 4. Core Components

Sprint 7은 다음 Component로 구성된다.

- ProjectDNAService
- ContentLibraryService
- PublishedRegistryService
- MetadataService
- KeywordMemoryService
- SearchIntentService
- RelatedContentService
- InternalLinkService
- DuplicateDetector
- AIContextBuilder

---

# 5. Layer Architecture

AI Engine
↓

AI Context Builder
↓

Recommendation Engine
↓

Relationship Engine
↓

Metadata Engine
↓

Published Registry
↓

Content Library
↓

Project DNA

---

# 6. Project DNA

Project DNA는 프로젝트의 편집 전략을 저장한다.

포함 정보

- 대표 주제
- 세부 주제
- 제외 주제
- 타겟 독자
- 톤앤매너
- 콘텐츠 목적
- 기본 플랫폼
- 기본 카테고리
- 기본 CTA 정책
- 이미지 전략
- SEO 전략
- 내부 링크 정책
- 관련 글 정책

Project DNA는 모든 콘텐츠 생성의 기본 Context가 된다.

---

# 7. Content Library

Content Library는 생성된 모든 콘텐츠의 저장소이다.

상태

- Draft
- Reviewing
- Approved
- Published
- Archived

저장 정보

- Title
- Summary
- Keywords
- Search Intent
- Category
- Tags
- Quality Report
- Generated Images
- CTA
- Internal Links

---

# 8. Published Registry

Published Registry는 실제 발행된 콘텐츠만 관리한다.

저장 정보

- Platform
- URL
- Publish Date
- Status
- Category
- Tags
- Search Intent
- Quality Score

Published Registry는

- 관련 글
- 내부 링크
- 중복 검사

의 기준 데이터가 된다.

---

# 9. Search Intent Memory

AI는 프로젝트별 Search Intent를 기억한다.

예)

- 정보형
- 구매형
- 비교형
- 문제 해결형
- 후기형

새 콘텐츠 생성 시 기존 Intent를 우선 활용한다.

---

# 10. Keyword Memory

프로젝트에서 사용된 모든 키워드를 저장한다.

구분

- Primary
- Secondary
- Long Tail
- Excluded

활용

- 중복 방지
- 추천
- 클러스터 생성

---

# 11. Related Content Engine

AI는 Published Registry를 기반으로

- 함께 보면 좋은 글
- 추천 글
- 시리즈

를 자동 추천한다.

---

# 12. Internal Link Intelligence

AI는

발행된 콘텐츠 중

가장 도움이 되는 글을 찾아

자동으로 내부 링크를 추천한다.

단순 키워드 일치가 아니라

Search Intent와 Topic을 함께 고려한다.

---

# 13. Duplicate Detection

다음을 검사한다.

- 제목 중복
- Search Intent 중복
- Keyword 중복
- Topic 중복

심각한 중복은 생성 전에 사용자에게 경고한다.

---

# 14. AI Context Builder

AI는 직접 Repository를 조회하지 않는다.

항상 AI Context Builder가 필요한 정보를 수집하여
하나의 Context로 전달한다.

Context 구성

- Project DNA
- Content Library
- Published Registry
- Keyword Memory
- Search Intent
- Related Contents
- Internal Links
- Quality History

---

# 15. Workflow

Natural Language

↓

Project 선택

↓

Project DNA 조회

↓

Content Library 조회

↓

Published Registry 조회

↓

Keyword Memory 조회

↓

Search Intent 조회

↓

Related Content 계산

↓

Internal Link 계산

↓

AI Context 생성

↓

AI Generation

↓

Quality Review

↓

Content Library 저장

↓

Published Registry 업데이트

---

# 16. Acceptance Criteria

Sprint 7 완료 기준

- Project DNA 적용
- Content Library 구축
- Published Registry 구축
- Search Intent Memory 구축
- Keyword Memory 구축
- Related Content 추천
- Internal Link 추천
- Duplicate Detection
- AI Context Builder
- Quality History 연동

---

# 17. Future Expansion

향후 추가 예정

- Google Search Console
- GA4
- Search Ranking
- Competitor Analysis
- Trend Intelligence
- Topic Cluster AI
- Semantic Graph
- Knowledge Graph
- AI Learning Feedback