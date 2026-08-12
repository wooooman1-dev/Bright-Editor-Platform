# Bright Editor Platform

이 파일은 Claude Code가 매 세션 자동으로 읽는 진입점이다. 실제 운영 규칙은
`AGENTS.md`에 있으며, 아래 import로 그대로 불러온다. 규칙을 고칠 때는 이 파일이
아니라 `AGENTS.md`를 고쳐라 — 원본은 하나여야 한다.

@AGENTS.md

## 문서 위계

`Docs/current/00_FOUNDATION/08_DECISION_LOG.md`가 프로젝트의 최상위 Source of
Truth다. 문서끼리 충돌하면 Decision Log를 따르고, 문서와 코드가 충돌하면 문서를
따른다.

코드를 쓰기 전에 읽을 것:

1. `Docs/current/00_FOUNDATION`
2. `Docs/current/01_PRODUCT`
3. `Docs/current/02_ARCHITECTURE`
4. `Docs/current/04_DEVELOPMENT`

## 검증 명령

```
npx vitest run <경로>   # 테스트 (전체 실행은 tests/unit 319개)
npx tsc --noEmit        # 타입체크
npx eslint .            # 린트
npm run dev             # Next 개발 서버
```

`tests/manual/`은 `RUN_*=1` 환경 변수로 게이트되어 있다. 실제 브라우저나 외부
계정을 사용하므로 요청받지 않은 한 실행하지 않는다.

## 전문 에이전트

`.claude/agents/`에 이 저장소 전용 에이전트가 정의되어 있다. 해당 영역 작업은
그쪽에 맡기는 편이 낫다.

| 에이전트 | 담당 |
| --- | --- |
| `architect` | 설계안, 영향 범위, Core/Apps/Shared 경계 검토 (읽기 전용) |
| `quality-root-cause` | 원고 품질 결함의 파이프라인 근본 원인 |
| `approval-evidence` | 승인 근거·출처 권위 판정, 프리플라이트 |
| `core-domain-dev` | `core/` 도메인, `app/application/` 유스케이스 |
| `platform-adapter-dev` | `apps/*`, 브라우저 자동화 |
| `ui-dev` | `app/` 화면, `core/presentation` |
| `test-runner` | 테스트·타입체크·린트 실행과 실패 진단 (읽기 전용) |
| `docs-keeper` | `Docs/current`, Decision Log, `todo.txt` |
| `approval-quality-auditor` | 승인용 품질·판정 로직 검토, 기준이 과한지 측정으로 판정 |
| `handover-scribe` | 컨텍스트 압축·세션 종료 전 `todo.txt` 인수인계 갱신 |

컨텍스트가 압축되기 직전 `PreCompact` 훅(`.claude/settings.json`)이 브랜치·커밋·
미커밋 변경을 `.claude/handover-snapshot.md`에 기록하고, `handover-scribe`를 불러
`todo.txt`를 갱신하라고 알린다.
