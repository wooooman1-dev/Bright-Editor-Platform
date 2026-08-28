# Content Lifecycle

Discover -> Decide -> Create -> Publish -> Measure -> Improve -> Repurpose

이 문서는 위 흐름이 코드에서 실제로 어떻게 실행되는지를 적는다. 모든 항목은
2026-08-28 기준 실제 코드 위치로 확인했으며, 추측은 넣지 않는다.

작성 계기: 이 지도가 없어서 "원고를 다시 생성할 수 없다"는 잘못된 판단을 했다.
서버는 재생성을 막지 않고, 화면에도 경로가 있다. 아래 3장을 보라.

---

## 1. 화면 → 버튼 → action

### 프로젝트 대시보드

| 버튼 | 결과 |
| --- | --- |
| 오늘 글 작성 | create 화면으로 이동 (자동 주제 선정 요청문) |
| 주제를 직접 입력해 작성 | create 화면으로 이동 (사용자 지정 요청문) |

### create 화면 — `app/user-flow/ContentCreationFlow.tsx`

| 버튼 | 줄 | 부르는 action | AI 호출 |
| --- | --- | --- | --- |
| 분석하고 추천받기 | 579 | `plan` | 1 |
| 직접 설정하기 | 580 | `manual-plan` | 0 |
| 저장 상태 새로고침 | 581 | 없음 (로컬) | 0 |
| 추천 다시 생성 | 606 | `plan` | 1 |
| 이 기획으로 직접 작성 | 607 | 없음 (Content 기록만 생성) | 0 |
| 기존 원고를 보존하고 새 Content로 생성 | 608 | `generate` (**새 contentId**) | 생성 1회 이상 |
| 이 기획으로 원고 만들기 | 609 | `generate` (**같은 contentId, 덮어씀**) | 생성 1회 이상 |

`confirm()` 은 `target` 기본값이 `"existing"` 이다 (`:298`). 원고가 이미 있으면
`window.confirm` 으로 덮어쓰기를 한 번 묻는다 (`:302`). 새 Content 경로는
`target: "new"` 로 `createId("content")` 를 새로 만든다 (`:303`).

### 편집기 — `app/user-flow/EditorWorkspaceImplementation.tsx`

| 버튼 | 줄 | action | AI 호출 |
| --- | --- | --- | --- |
| 품질 다시 검토 | 478 (`review()` `:208`) | `review-quality` | **0** |
| AI 개선안 만들기 | 478 (`requestQualityImprovement()` `:240`) | `improve-quality` | 1 |
| (개선안 적용) | 257 | `accept-improvement` | **0** |
| 수정 지시 입력 후 실행 | `revise()` `:220` | `revise` | 1 |
| Retry generation without creating a duplicate | 469 (`retryGeneration()` `:230`) | `generate` (**같은 contentId**) | 생성 1회 이상 |
| 추천 주제 후보 다시 보기 → | 463 | create 화면으로 이동 (contentId 유지) | 0 |
| 플랫폼 미리보기 | `:179` | `render-platform` | 0 |

**재생성 버튼의 렌더링 조건**: `:469` 의 retry 버튼은 `content.generationError`
가 있을 때만 그려진다. 정상 생성된 원고에는 보이지 않는다. 서버가 막는 것이
아니라 화면이 감추는 것이다.

---

## 2. action 명세 — `app/api/studio/route.ts`

| action | 줄 | AI 호출 | 주요 가드 | 무엇을 쓰나 |
| --- | --- | --- | --- | --- |
| `start-planning` | 71 | 0 | workspace·project 소유 | `planningWorkflow` 시작 |
| `plan` | 86 | **1** (generation 모델, `:639`) | operation 일치 `:599`, 실패한 operation 재사용 금지 `:603` | Planning 후보 |
| `manual-plan` | 89 | **0** (`createManualPlanningResult` `:638`) | 위와 같음 | Planning 후보 |
| `generate` | 92 | **1~4** (아래 4장) | 같은 Content 동시 생성 금지 `:105`. **원고 존재 여부 가드는 없음** | `document`, `quality`, `status` |
| `final-review` | 319 | **1** (review 모델 `:328`) | `document` 필요 | `document`, `quality`, `status` |
| `revise` | 346 | **1** (generation 모델 `:354`) | `document` 필요 | 응답만 반환 (저장은 별도) |
| `improve-quality` | 367 | **1** (review 모델 `:375`) | 개선 항목이 없으면 거부 `:374` | 미리보기 (저장 안 함) |
| `accept-improvement` | 401 | **0** | 리비전 일치 `:405`, 개선 채택 조건, standard 승인 필요 `:417` | `document`, `quality`, `status` |
| `review-quality` | 473 | **0** | `document` 필요 | `quality`, `status` |
| `render-platform` / `render-tistory` | 438 | 0 | 지원 플랫폼 | 없음 |
| `prepare-tistory` | 461 | 0 | Tistory 활성화, 카테고리 선택 | 없음 |
| `content-deletion-impact` | 424 | 0 | — | 없음 |
| `delete-content` | 429 | 0 | — | Content 삭제 |

### 유일한 덮어쓰기 금지

`app/user-flow/user-data.ts:298`

```
if (existing?.document) {
  throw new Error("원고가 생성된 Content는 새 Planning 요청으로 덮어쓸 수 없습니다.");
}
```

**Planning 에만 걸려 있다.** 생성 경로에는 같은 가드가 없고,
`applyCanonicalDocument` (`user-data.ts:684`) 도 기존 문서를 그대로 교체한다.

즉 **원고 재생성은 허용된다.** 막힌 것은 이미 원고가 있는 Content 에 새 Planning
을 다시 돌리는 것뿐이며, 그때도 기존 추천 후보는 보존되므로 그중에서 다시 고르면
된다.

---

## 3. 원고를 다시 만드는 방법 (같은 Content 유지)

1. 편집기에서 **「추천 주제 후보 다시 보기 →」** — URL 에 `contentId` 가 유지된 채
   create 화면으로 간다.
2. 저장된 추천 후보 목록에서 **그 원고의 기획**을 고른다. Planning 을 다시 돌릴
   필요가 없고, 돌리면 위 가드에 막힌다.
3. **「이 기획으로 원고 만들기」** — 덮어쓰기 확인 창이 뜨고, 같은 contentId 의
   문서를 새 생성 결과로 교체한다.

새 Content 로 남기고 비교하려면 같은 화면의 **「기존 원고를 보존하고 새 Content로
생성」** 을 쓴다.

---

## 4. AI 호출 비용 구조

`generate` 한 번이 부르는 호출은 모드에 따라 다르다.

- 승인 준비(`adsense_approval`) + 구조화 생성 + Opportunity 가 모두 있을 때만
  출처 preflight 가 돈다 (`core/ai/AIWorkflow.ts:112`).
- preflight discovery 는 최대 2회 (`ApprovalSourcePreflight.ts:343`
  `explicitDiscoveryMaximumAttempts = 2`).
- 생성 1회 (`AIWorkflow.ts:178`).
- 검토 1회. 단 규칙 채점이 이미 정식 승인이면 **호출하지 않는다**
  (`EditorialQualityPipeline.ts:90`, `skipped / rule_validation_already_standard_approved`).

실측: 근로장려금 원고 한 편이 3회 호출 87,642 tokens $0.465334 (편집기 AI USAGE).

무료 동작: `review-quality`, `accept-improvement`, `manual-plan`,
`render-platform`, `render-tistory`, `prepare-tistory`, 삭제 관련 전부.

---

## 5. Content status

`UserContentStatus` — `app/user-flow/user-data.ts:142`

```
planning | configuration_required | draft | in_review | ready | draft_saved
```

- `applyCanonicalDocument` 는 `status: "draft"` 로 되돌린다 (`:690`).
- `review-quality`, `final-review`, `accept-improvement` 는 `isPublishReady` 결과에
  따라 `ready` 또는 `in_review` 로 정한다.
- `improve-quality` 가 적용될 때는 `ready` 로 쓴다 (`route.ts:394`).

발행 기록의 `workflow` 는 별도 축이다: `draft.create`, `draft.update`,
`schedule.create`, `schedule.verify` 등
(`app/application/publishing/WordPressDraftApplicationService.ts:171`, `:214`).

---

## 6. 이 문서를 고칠 때

한 줄이라도 코드 위치 없이 쓰지 않는다. 화면에서 눌러본 결과만으로도 쓰지 않는다.
버튼이 안 보이는 것과 서버가 막는 것은 다르며, 이 둘을 섞은 것이 이 문서를 쓰게 된
이유다.
