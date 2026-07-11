# Bright Editor Platform System Architecture

## 1. 시스템 개요

Bright Editor Platform은 콘텐츠의 전체 생명주기를 관리하는 플랫폼이다.

```text
Workspace
    ↓
Project
    ↓
Content Lifecycle
    ↓
Core
    ↓
AI Provider Layer
    ↓
Platform Adapter
```

첫 번째 Platform Adapter는 Tistory이며, 이후 WordPress, YouTube, Naver Cafe, Blog, Shopping으로 확장한다.

---

## 2. 현재 기술 아키텍처

```text
Next.js App Router
├── React UI
├── TypeScript
├── Tailwind CSS
├── Route Handlers
├── Server Actions
└── Local Runtime

Core
├── Content Strategy Engine
├── AI Editor Engine
├── Quality Engine
├── Image Strategy Engine
├── Publishing Engine
├── Content Transformation Engine
├── Analytics Engine
└── AI Provider Layer

Platform Adapters
├── Tistory
├── WordPress
├── YouTube
├── Naver Cafe
└── Shopping

Automation
└── Playwright

Data
├── Local File
└── SQLite
```

---

## 3. 현재 운영 모델

초기 버전은 단일 사용자 로컬 도구다.

```text
Windows PC
    ↓
Local Next.js Application
    ↓
Local Data / SQLite
    ↓
Playwright Browser Automation
    ↓
Publishing Platform
```

현재 단계에서는 로그인, 결제, 멀티테넌트, 클라우드 데이터베이스를 사용하지 않는다.

---

## 4. 상용화 확장 모델

판매 시점에는 같은 Next.js 기반 위에 서버 기능을 확장한다.

```text
Browser
    ↓
Next.js Application
    ↓
Authentication
    ↓
Workspace / Project
    ↓
Cloud Database
    ↓
AI Providers / Platform Connectors
```

상용화 단계에서 추가될 수 있는 기능:

- 인증 및 세션
- 사용자 권한
- 멀티테넌트
- 구독 및 결제
- SSR
- SEO
- 캐싱
- 클라우드 데이터베이스
- 비동기 작업 큐
- 운영 모니터링

---

## 5. Core와 Platform Adapter 분리

Core는 플랫폼 독립적이어야 한다.

Core가 알면 안 되는 것:

- Tistory DOM Selector
- WordPress API 구조
- YouTube 업로드 방식
- Naver Cafe 편집기 구조

Platform Adapter는 플랫폼별 구현을 담당한다.

```text
Publishing Engine
    ↓
Publishing Adapter Interface
    ├── Tistory Adapter
    ├── WordPress Adapter
    └── YouTube Adapter
```

---

## 6. AI Provider 분리

AI 기능은 특정 공급자 SDK에 직접 종속되지 않는다.

```text
AI Editor Engine
    ↓
AI Provider Interface
    ├── OpenAI
    ├── Claude
    ├── Gemini
    └── Ollama
```

Provider별 모델명, 인증, 요청 형식, 응답 변환은 Provider 구현 내부에서 처리한다.

---

## 7. 이미지 아키텍처

Image Strategy Engine은 이미지의 필요성, 목적, 위치, 유형을 결정한다.

기존 Canvas 기반 썸네일 생성 방식은 사용하지 않는다.

```text
Content Analysis
    ↓
Image Strategy
    ↓
Image Specification
    ↓
Image Provider or Design Tool
    ↓
Quality Review
```

실제 이미지 생성 기술은 Provider 형태로 추가할 수 있도록 설계한다.

---

## 8. 테스트 전략

- Core: Unit Test
- Platform Adapter: Integration Test
- UI: Component Test
- Publishing Workflow: Playwright End-to-End Test
- 실제 플랫폼 테스트: 제한된 테스트 계정 또는 Draft 기반 테스트

모든 새 기능은 작은 단위로 구현하고 바로 테스트한다.
