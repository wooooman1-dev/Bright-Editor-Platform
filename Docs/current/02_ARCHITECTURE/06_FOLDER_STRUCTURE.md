# Bright Editor Platform Folder Structure

## 1. 기본 원칙

- Next.js App Router를 사용한다.
- `app`은 Next.js 라우트와 화면을 담당한다.
- `platforms`는 Tistory, WordPress 등 플랫폼별 구현을 담당한다.
- `core`에는 플랫폼 독립 로직만 둔다.
- `shared`에는 공통 UI, 타입, 설정, 유틸리티를 둔다.
- 기존 `tstory_auto` 코드는 복사하거나 포함하지 않는다.

---

## 2. 권장 구조

```text
BrightEditorPlatform
├── app
│   ├── (workspace)
│   │   ├── dashboard
│   │   ├── projects
│   │   └── editor
│   ├── api
│   ├── layout.tsx
│   └── page.tsx
│
├── core
│   ├── ai
│   │   ├── providers
│   │   ├── prompts
│   │   └── types
│   ├── analytics
│   ├── content-strategy
│   ├── editor
│   ├── image-strategy
│   ├── publishing
│   ├── quality
│   └── transformation
│
├── platforms
│   ├── tistory
│   │   ├── adapter
│   │   ├── automation
│   │   ├── selectors
│   │   ├── types
│   │   └── tests
│   ├── wordpress
│   ├── youtube
│   ├── naver-cafe
│   └── shopping
│
├── shared
│   ├── components
│   │   ├── ui
│   │   └── layout
│   ├── config
│   ├── constants
│   ├── hooks
│   ├── lib
│   ├── types
│   └── utils
│
├── data
│   ├── database
│   ├── exports
│   └── runtime
│
├── public
│   └── assets
│
├── tests
│   ├── unit
│   ├── integration
│   └── e2e
│
├── scripts
├── Docs
├── .env.example
├── .gitignore
├── next.config.ts
├── package.json
├── playwright.config.ts
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. Next.js `app`과 플랫폼 `platforms`의 차이

### `app`

Next.js 화면과 URL 경로를 관리한다.

예:

```text
/dashboard
/projects
/editor
```

### `platforms`

외부 콘텐츠 플랫폼과 연결하는 구현을 관리한다.

예:

```text
platforms/tistory
platforms/wordpress
platforms/youtube
```

Next.js의 `app` 폴더와 혼동을 피하기 위해 플랫폼 앱 폴더명은 `apps`가 아니라 `platforms`를 사용한다.

---

## 4. v0.1 최소 구조

초기에는 전체 폴더를 한 번에 만들지 않는다.

v0.1에서는 필요한 구조만 만든다.

```text
BrightEditorPlatform
├── app
├── core
│   └── publishing
├── platforms
│   └── tistory
│       ├── automation
│       ├── selectors
│       └── tests
├── shared
│   ├── config
│   ├── types
│   └── utils
├── tests
│   └── e2e
├── Docs
├── .env.example
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

기능이 실제로 필요해질 때 폴더를 추가한다.

---

## 5. 금지 사항

- `core`에서 Tistory Selector 사용
- UI 컴포넌트 안에서 Playwright 직접 실행
- API 키를 코드에 직접 작성
- 플랫폼별 설정을 공통 Core에 하드코딩
- 사용하지 않는 폴더와 추상화를 미리 대량 생성
- 기존 Canvas 썸네일 코드를 이식
- 기존 `tstory_auto` 코드를 새 프로젝트에 복사
