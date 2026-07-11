# Bright Editor Platform Release Plan

## 버전 정책

Semantic Versioning을 기준으로 관리한다.

```text
MAJOR.MINOR.PATCH
```

- MAJOR: 제품 구조 또는 호환성에 큰 변화
- MINOR: 새로운 기능 추가
- PATCH: 버그 수정과 안정화

개발 초기 버전은 `0.x.x`를 사용한다.

---

## v0.1.0 — Tistory Draft Foundation

### 목표

Playwright로 Tistory 글쓰기 페이지를 열고 HTML을 입력한 뒤 임시저장한다.

### 완료 조건

- Playwright 브라우저 실행
- 로그인 세션 저장
- 로그인 세션 복원
- 글쓰기 페이지 진입
- HTML 모드 전환
- 제목 입력
- HTML 본문 입력
- 임시저장
- 성공 및 실패 로그
- 최소 자동화 테스트

### 제외

- 발행
- 예약 발행
- 이미지 생성
- Canvas 썸네일 생성
- AI Editor
- Quality Review
- 사용자 로그인

---

## v0.2.0 — Project Foundation

### 목표

Project 단위로 콘텐츠와 설정을 관리한다.

### 범위

- Project 생성 및 선택
- Project Profile
- Platform Settings
- Content Assets
- Activity Timeline
- Version History
- SQLite 또는 로컬 저장 구조

---

## v0.3.0 — AI Editor

### 목표

단일 Generation 호출로 Editorial Team 결과를 생성한다.

### 범위

- AI Provider Layer
- OpenAI Provider
- Prompt Engine
- Content Strategy
- 원고
- SEO
- 이미지 전략
- 내부링크 전략
- 광고 전략
- HTML

---

## v0.4.0 — Quality Review

### 목표

AI 검수와 코드 기반 검증을 수행한다.

### 범위

- Quality Review AI
- Rule Validation
- 품질 점수
- 오류 목록
- 수정 제안
- 자동 보정 가능한 규칙

---

## v0.5.0 — Tistory Publishing

### 목표

Tistory Edition을 개인 운영에 사용할 수 있는 수준으로 완성한다.

### 범위

- 이미지 업로드
- 대표 이미지
- 예약 발행
- 발행 상태
- 실패 복구
- 실행 기록

---

## v0.6.0 — Content Lifecycle

### 범위

- Discover
- Decide
- Create
- Publish
- Measure
- Improve
- Repurpose

---

## v1.0.0 — Tistory Edition Stable

### 목표

개인용 Tistory Edition의 안정 버전

### 완료 기준

- 핵심 기능 안정화
- 데이터 손실 방지
- 발행 실패 복구
- 테스트 자동화
- 문서 최신화
- 장기 운영 가능

---

## 향후 상용 버전

판매 준비가 시작되면 별도 상용화 릴리스를 정의한다.

예상 범위:

- 인증
- 사용자 Workspace
- 구독
- 결제
- SEO
- SSR
- 클라우드 운영
- 멀티테넌트
