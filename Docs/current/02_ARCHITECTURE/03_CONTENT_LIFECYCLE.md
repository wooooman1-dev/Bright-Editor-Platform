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

| 버튼 | 핸들러 | 부르는 action | AI 호출 |
| --- | --- | --- | --- |
| 분석하고 추천받기 | `analyze(false, …)` | `plan` | 1 |
| 직접 설정하기 | `analyze(true, …)` | `manual-plan` | 0 |
| 저장 상태 새로고침 | `onRefresh()` | 없음 (로컬) | 0 |
| 추천 다시 생성 | `analyze(false, true)` | `plan` | 1 |
| 이 기획으로 직접 작성 | `confirm(false)` | 없음 (Content 기록만 생성) | 0 |
| 기존 원고를 보존하고 새 Content로 생성 | `confirm(true, …, "new")` | `generate` (**새 contentId**) | 생성 1회 이상 |
| 이 기획으로 원고 만들기 | `confirm(true)` | `generate` (**같은 contentId, 덮어씀**) | 생성 1회 이상 |

`confirm()` 은 `target` 기본값이 `"existing"` 이다. 원고가 이미 있으면
`window.confirm` 으로 덮어쓰기를 한 번 묻는다. 새 Content 경로는
`target: "new"` 로 `createId("content")` 를 새로 만든다.

### 편집기 — `app/user-flow/EditorWorkspaceImplementation.tsx`

| 버튼 | 핸들러 | action | AI 호출 |
| --- | --- | --- | --- |
| 품질 다시 검토 | `review()` | `review-quality` | **0** |
| AI 개선안 만들기 | `requestQualityImprovement()` | `improve-quality` | 1 |
| (개선안 적용) | `acceptImprovement()` | `accept-improvement` | **0** |
| 수정 지시 입력 후 실행 | `revise()` | `revise` | 1 |
| Retry generation without creating a duplicate | `retryGeneration()` | `generate` (**같은 contentId**) | 생성 1회 이상 |
| 추천 주제 후보 다시 보기 → | 편집기 상단 버튼 | create 화면으로 이동 (contentId 유지) | 0 |
| 플랫폼 미리보기 | `previewPlatform()` | `render-platform` | 0 |

**재생성 버튼의 렌더링 조건**: `retryGeneration()` 버튼은 `content.generationError`
가 있을 때만 그려진다. 정상 생성된 원고에는 보이지 않는다. 서버가 막는 것이
아니라 화면이 감추는 것이다.

---

## 2. action 명세 — `app/api/studio/route.ts`

찾는 법: `grep -n 'body.action === "<이름>"' app/api/studio/route.ts`

| action | AI 호출 | 주요 가드 | 무엇을 쓰나 |
| --- | --- | --- | --- |
| `start-planning` | 0 | workspace·project 소유 | `planningWorkflow` 시작 |
| `plan` | **1** (generation 모델, `executePlanning` 안의 `ContentPlanningStrategy.analyze`) | operation 일치, 실패한 operation 재사용 금지 | Planning 후보 |
| `manual-plan` | **0** (`createManualPlanningResult`) | 위와 같음 | Planning 후보 |
| `generate` | **1~4** (아래 4장) | 같은 Content 동시 생성 금지(`activeGenerationOperations`). **원고 존재 여부 가드는 없음** | `document`, `quality`, `status` |
| `final-review` | **1** (review 모델, `finalEditInstruction`) | `document` 필요 | `document`, `quality`, `status` |
| `revise` | **1** (generation 모델) | `document` 필요 | 응답만 반환 (저장은 별도) |
| `improve-quality` | **1** (review 모델) | `currentQuality.tasks` 가 비면 거부 | 미리보기 (저장 안 함) |
| `accept-improvement` | **0** | 리비전 일치, `evaluateQualityImprovement` 채택, `isPublishReady` | `document`, `quality`, `status` |
| `review-quality` | **0** | `document` 필요 | `quality`, `status` |
| `render-platform` / `render-tistory` | 0 | 지원 플랫폼 | 없음 |
| `prepare-tistory` | 0 | Tistory 활성화, 카테고리 선택 | 없음 |
| `content-deletion-impact` | 0 | — | 없음 |
| `delete-content` | 0 | — | Content 삭제 |

### 유일한 덮어쓰기 금지

`app/user-flow/user-data.ts` 의 `startContentPlanning`

```
if (existing?.document) {
  throw new Error("원고가 생성된 Content는 새 Planning 요청으로 덮어쓸 수 없습니다.");
}
```

**Planning 에만 걸려 있다.** 생성 경로에는 같은 가드가 없고,
`applyCanonicalDocument` (`applyCanonicalDocument`) 도 기존 문서를 그대로 교체한다.

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
  출처 preflight 가 돈다 (`AIWorkflow.generate` 의 `sourcePreflight` 분기).
- preflight discovery 는 최대 2회 (`ApprovalSourcePreflight.ts` 의 `explicitDiscoveryMaximumAttempts = 2`).
- 생성 1회 (`AIWorkflow.generate` 의 `this.provider.generate`).
- 검토 1회. 단 규칙 채점이 이미 정식 승인이면 **호출하지 않는다**
  (`EditorialQualityPipeline.run` 의 `meetsStandardApprovalTarget` 조기 반환, `skipped / rule_validation_already_standard_approved`).

실측: 근로장려금 원고 한 편이 3회 호출 87,642 tokens $0.465334 (편집기 AI USAGE).

무료 동작: `review-quality`, `accept-improvement`, `manual-plan`,
`render-platform`, `render-tistory`, `prepare-tistory`, 삭제 관련 전부.

---

## 5. Content status

`UserContentStatus` — `app/user-flow/user-data.ts`

```
planning | configuration_required | draft | in_review | ready | draft_saved
```

- `applyCanonicalDocument` 는 `status: "draft"` 로 되돌린다 (`applyCanonicalDocument`).
- `review-quality`, `final-review`, `accept-improvement` 는 `isPublishReady` 결과에
  따라 `ready` 또는 `in_review` 로 정한다.
- `improve-quality` 가 적용될 때는 `ready` 로 쓴다 (`improve-quality` 분기).

발행 기록의 `workflow` 는 별도 축이다: `draft.create`, `draft.update`,
`schedule.create`, `schedule.verify` 등
(`WordPressDraftApplicationService` 의 `identity(input, "draft.update")`).

---

## 6. 이 문서를 고칠 때

한 줄이라도 코드 위치 없이 쓰지 않는다. 화면에서 눌러본 결과만으로도 쓰지 않는다.
버튼이 안 보이는 것과 서버가 막는 것은 다르며, 이 둘을 섞은 것이 이 문서를 쓰게 된
이유다.
