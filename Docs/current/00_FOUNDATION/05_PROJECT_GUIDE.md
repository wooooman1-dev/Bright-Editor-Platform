# Bright Editor Platform Project Guide

## 1. 프로젝트 개요

Bright Editor Platform은 단순한 AI 글쓰기 도구가 아니라 콘텐츠의 전체 생명주기를 관리하는 AI Content Lifecycle Platform이다.

첫 번째 애플리케이션은 Tistory Edition이지만, 모든 Core 기능은 향후 WordPress, YouTube, Naver Cafe, Blog, Shopping 등 다양한 플랫폼에서 재사용할 수 있도록 설계한다.

---

## 2. 개발 기준

### Platform First

모든 기능은 특정 플랫폼에 종속되지 않도록 설계한다.

플랫폼 독립 기능은 Core에 배치하고, 플랫폼별 구현은 Platform Adapter에 배치한다.

### Clean New Build

Bright Editor Platform은 `D:\BrightEditorPlatform`에서 새롭게 개발한다.

기존 `D:\tstory_auto` 프로젝트는 다음 원칙을 따른다.

- 수정하지 않는다.
- 복사하지 않는다.
- 코드 기반으로 사용하지 않는다.
- 기존 기능 아이디어를 참고할 수는 있으나 구현은 새 구조에 맞게 다시 작성한다.
- 기존 프로젝트의 동작 안정성을 훼손하지 않는다.

### Design First

구현 전에 관련 문서와 아키텍처를 확인한다.

아키텍처 변경이 필요한 경우 개발방에서 즉시 임의 변경하지 않고, 기획 또는 회의에서 결정한 후 개발을 진행한다.

### Small Incremental Development

기능은 작은 단위로 구현하고 각 단계가 끝날 때마다 즉시 테스트한다.

한 번에 여러 기능을 추가하지 않는다.

---

## 3. 기술 스택

### 현재 개인용 버전

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui는 필요한 컴포넌트만 선택적으로 사용
- Playwright
- 로컬 파일 또는 SQLite
- Vitest
- Playwright Test

### 향후 판매용 버전

판매 단계에서 다음 기능을 확장한다.

- 사용자 로그인
- Workspace 및 권한 관리
- 구독 및 결제
- 멀티테넌트
- 공개 마케팅 페이지
- SEO
- SSR 및 캐싱
- 클라우드 데이터베이스
- 운영 환경 배포

현재 단계에서는 위 기능을 구현하지 않지만, 나중에 추가할 수 있는 구조로 개발한다.

---

## 4. AI 전략

AI는 Writer가 아니라 Editorial Team으로 동작한다.

Generation 한 번에서 다음 결과를 생성하는 것을 목표로 한다.

- 검색 의도 분석
- 독자 분석
- 콘텐츠 기획
- 원고
- SEO
- 이미지 전략
- 내부링크 전략
- 광고 전략
- HTML

그 후 Quality Review AI를 한 번 실행한다.

코드로 검증 가능한 항목은 Rule Validation이 담당한다.

```text
Generation 1회
    ↓
Quality Review 1회
    ↓
Rule Validation
```

불필요한 AI 호출을 추가하지 않는다.

---

## 5. 이미지 정책

이미지는 장식이 아니라 콘텐츠 목적을 가져야 한다.

지원할 이미지 유형 예시는 다음과 같다.

- Hero Image
- Comparison
- Checklist
- Infographic
- Summary Card
- Warning Card

기존 Canvas 기반 썸네일 자동 생성 방식은 사용하지 않는다.

단순한 도형과 텍스트 합성 방식은 Bright Editor Platform의 품질 기준을 충족하지 못하므로 신규 구현 대상에서 제외한다.

이미지 기능은 Image Strategy Engine을 중심으로 설계하고, 향후 고품질 이미지 생성 도구 또는 디자인 도구 연동을 검토한다.

---

## 6. 현재 최우선 목표

v0.1의 목표는 Tistory Publishing Adapter의 최소 동작을 검증하는 것이다.

```text
Playwright 실행
    ↓
티스토리 로그인 세션 확인
    ↓
글쓰기 페이지 진입
    ↓
HTML 입력
    ↓
임시저장
```

발행 기능, 이미지 생성, AI Editor, Analytics는 이후 단계에서 구현한다.

---

## 7. 핵심 개발 원칙

> 기존 프로젝트에 의존하지 않고 Bright Editor Platform을 새롭게 구축한다. 모든 기능은 Platform First 원칙에 따라 Core와 Platform Adapter를 분리하며, 작은 단위로 구현하고 즉시 테스트한다.
