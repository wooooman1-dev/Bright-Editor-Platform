# Bright Editor Platform Roadmap

## 제품 개발 방향

Bright Editor Platform은 개인용 고품질 도구로 시작하고, 기능과 품질이 충분히 검증된 후 판매 가능한 SaaS 플랫폼으로 확장한다.

현재 단계에서는 판매 기능보다 실제 콘텐츠 제작과 발행을 안정적으로 지원하는 기능을 우선한다.

---

## Phase 0 — Foundation

### 목표

- 프로젝트 문서 확정
- 기술 스택 확정
- 신규 Next.js 프로젝트 초기화
- Core와 Platform Adapter 경계 정의
- 테스트 환경 구성

### 주요 기술

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Playwright
- Vitest
- Playwright Test

---

## Phase 1 — Tistory Publishing Foundation

### 목표

Playwright 기반으로 Tistory 글쓰기와 임시저장을 안정적으로 수행한다.

### 범위

- 브라우저 실행
- 로그인 세션 저장 및 복원
- Tistory 글쓰기 페이지 진입
- HTML 모드 전환
- HTML 입력
- 임시저장
- 실행 결과 로그
- 오류 처리

### 제외

- 자동 발행
- 예약 발행
- 이미지 생성
- Canvas 썸네일
- AI 원고 생성
- Analytics

---

## Phase 2 — Project Foundation

### 목표

콘텐츠와 발행 설정을 Project 단위로 관리한다.

### 범위

- Project 생성
- Project Profile
- AI Profile
- Platform Settings
- Content Assets
- Activity Timeline
- Version History
- 로컬 저장소 또는 SQLite

---

## Phase 3 — AI Editor

### 목표

한 번의 AI Generation으로 Editorial Team 결과를 생성한다.

### 범위

- Content Strategy Engine
- AI Provider Layer
- Prompt Engine
- AI Editor Engine
- SEO
- 이미지 전략
- 내부링크 전략
- 광고 전략
- HTML 생성

---

## Phase 4 — Quality System

### 목표

AI 결과를 검수하고 품질 기준을 자동으로 확인한다.

### 범위

- Quality Review AI
- Rule Validation
- SEO 점수
- Readability 점수
- Search Intent 점수
- HTML 품질 점수
- 오류 수정 흐름

---

## Phase 5 — Tistory Edition Completion

### 목표

개인용 Tistory Edition의 실제 운영 수준 완성

### 범위

- 이미지 업로드
- 대표 이미지 설정
- 예약 발행
- 발행 이력
- 실패 복구
- 내부링크 관리
- 콘텐츠 개선 흐름

---

## Phase 6 — Platform Expansion

### 순서

1. WordPress
2. YouTube
3. Naver Cafe
4. Blog
5. Shopping

Core는 재사용하고 각 플랫폼별 Adapter만 추가한다.

---

## Phase 7 — Analytics and Growth

### 범위

- 검색 노출
- 순위
- CTR
- 콘텐츠 성과
- 개선 추천
- 다음 글 추천
- 수익 분석
- Repurpose 추천

---

## Phase 8 — Commercial SaaS

판매 가능한 시점에 다음을 구현한다.

- 로그인 및 회원가입
- 사용자별 Workspace
- 권한
- 구독 및 결제
- 멀티테넌트
- 공개 마케팅 페이지
- SEO
- SSR
- 클라우드 데이터베이스
- 운영 모니터링
- 사용량 및 AI 비용 관리

판매 기능은 현재 단계에서 선행 구현하지 않는다.
