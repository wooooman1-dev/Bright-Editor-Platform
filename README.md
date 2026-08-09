# Bright Editor Platform

AI 기반 Content Lifecycle Platform. 사용자 화면과 외부 제품명은 **Bright Studio**를 사용하며, 이 저장소(코드/아키텍처/내부 문서)에서는 **Bright Editor Platform**을 사용한다.

## Mission

Empower creators to build, manage and grow professional-quality content across any domain and any platform.

```
Strategy -> Production -> Publishing -> Operation -> Growth
```

Core는 도메인/플랫폼에 종속되지 않도록 설계하고, 플랫폼별 구현은 Platform Adapter(`apps/`)에 분리한다.

## Tech Stack

- Next.js (App Router) / React / TypeScript
- Tailwind CSS
- Playwright (Tistory 등 브라우저 자동화 어댑터)
- Vitest (단위/통합 테스트)

## Getting Started

```bash
npm install
npm run dev        # 개발 서버
npm run build       # 프로덕션 빌드
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
```

## Project Structure

```
app/          Next.js 라우트, API, 화면(user-flow), 애플리케이션 서비스
apps/         플랫폼별 Adapter (tistory, wordpress)
core/         플랫폼 독립 도메인 모듈 (ai, approval, content, quality, publishing, media, intelligence 등)
Docs/         제품/아키텍처/개발 문서 (current = 최신, legacy = 이전 버전)
scripts/      운영/마이그레이션 스크립트
tests/        unit / integration / e2e / manual 테스트
```

## Documentation

프로젝트의 최상위 소스 오브 트루스는 다음 문서다.

- `Docs/current/00_FOUNDATION/04_PROJECT_GUIDE.md` — 개발 기준, 기술 스택, 핵심 원칙
- `Docs/current/00_FOUNDATION/08_DECISION_LOG.md` — 확정된 아키텍처/정책 결정 (Decision Log)
- `Docs/current/01_PRODUCT/01_PRD.md` — 제품 요구사항
- `Docs/current/01_PRODUCT/06_PRODUCT_ARCHITECTURE.md` — 제품 아키텍처(엔진 구조)

새 기능을 설계하거나 아키텍처를 변경하기 전에는 위 문서, 특히 Decision Log를 먼저 확인한다.

## License

ISC
