# Bright Editor Platform — 수정 작업 계획서

작성일: 2026-08-14
전제: `01_ROOT_CAUSE_DIAGNOSIS.md`, `02_ARCHITECTURE_REDESIGN.md`
브랜치 제안: `fix/write-time-fact-constraint` (현재 `feat/scheduled-publishing-and-diversity`에서 분기)

---

## 0. 진행 원칙

프로젝트 지침을 그대로 따른다.

- **Design First** — 이 계획서 승인 전에는 코드를 쓰지 않는다.
- **Small incremental development** — Phase 단위로 커밋하고, 각 Phase 끝에 실제 원고 1편을 생성해 확인한다.
- **Protect existing features** — 발행 경로(WordPress Draft/Schedule, Tistory)는 건드리지 않는다.
- **추측 금지** — 각 Phase의 완료 기준은 실측값으로 정의한다.

---

## Phase 0 — 출혈 정지 (반나절, 최우선)

**목적:** 지금 당장 원고가 발행 가능한 상태가 되게 한다. 재설계 전에 손실을 멈춘다.

| # | 작업 | 파일 | 내용 |
| --- | --- | --- | --- |
| 0-1 | 스윕 비활성화 | `core/approval/GeneratedFactualClaimInventory.ts` | `findUntrackedCriticalSurfaces` 결과에 대한 문서 삭제 루프(155~180행)를 제거. 항목은 `unsupported`로 **기록만** 한다 |
| 0-2 | 명시 인벤토리 삭제도 정지 | 같은 파일 144~146행 | `removeGeneratedFactualSurface` 호출 제거 |
| 0-3 | duration 검출 축소 | `core/approval/GeneratedClaimBinding.ts:355` | `\d+(개월\|일\|주\|년)` 단독 검출을 제거하고, **기한 수식어(이내/이상/이하/미만/초과/까지)가 붙은 경우만** 검출 |
| 0-4 | 앵커 소실 차단 완화 | `core/approval/GeneratedClaimVerificationIntegrity.ts` | 스윕이 없어지면 앵커가 사라지지 않는다. 그래도 남는 소실은 `blocking`이 아니라 `advisory`로 낮춘다 |

**확인 방법 (필수):**
1. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run tests/unit`
2. **개발 서버에서 실제 원고 1편 생성** — 브라우저로 직접
3. 생성 후 `studio-data.json`에서 실측:
   - 인벤토리 `removed` 항목의 `surfaceText`가 **본문에 그대로 남아 있는가**
   - 표 빈칸 0개
   - `status`가 `ready`에 도달하는가
   - 품질 게이트 차단 사유가 남았다면 무엇인가

**완료 기준:** 새 원고 1편이 `ready` 도달 + WordPress Draft 저장 성공.

> ⚠️ Phase 0은 "검증 안 된 사실이 원고에 남을 수 있다"는 상태를 만든다.
> 이는 **의도된 것**이다 — 지금은 검증된 사실도 남지 않는 상태이고,
> 사람이 검토(Review First / Draft Only는 계속 켜져 있다) 후 발행하므로 안전하다.
> Phase 2가 완료되면 이 위험은 생성 시점에서 처리된다.

---

## Phase 1 — 사실 정의 단일화 (2~3일)

**목적:** RC-2의 교착을 구조적으로 제거한다.

| # | 작업 | 산출물 |
| --- | --- | --- |
| 1-1 | `FactualSurfaceTaxonomy.ts` 신설 | `classifyFactualSurface()` — external_fact / editorial_frame / illustrative |
| 1-2 | 판정 규칙 구현 | 수치값 + 단위 + 귀속 주체 3요소 AND. 값 없는 조건어 제외. 기한 수식어 규칙 |
| 1-3 | `GeneratedClaimBinding` 교체 | `detectHighRiskScalarTokens` → taxonomy 호출 |
| 1-4 | `ExplicitVerificationPreflight` 교체 | Claim 선정 기준을 taxonomy로 |
| 1-5 | 인벤토리 기록 기준 교체 | `criticalSurfacePattern` 제거 |
| 1-6 | 합의 테스트 | `tests/outcome/FactTaxonomyAgreement.test.ts` — 세 호출부가 같은 문장에 같은 판정 |

**측정 기준 (승인 근거):**
현재 저장된 15편 1,499문장을 새 taxonomy로 재분류해 표로 제출한다.

- external_fact 로 분류된 문장 수 (기대: 문장당 값·단위·주체가 있는 소수)
- 기존 패턴이 잡았지만 새 규칙이 제외한 문장 목록 (샘플 20개)
- 기존 패턴이 놓쳤지만 새 규칙이 잡는 문장 목록

**이 표를 보고 사장님이 기준이 과한지/느슨한지 판정한 뒤 다음 단계로 넘어간다.**
(`.claude/agents/approval-quality-auditor`가 담당할 수 있는 작업이다.)

---

## Phase 2 — 생성 시점 제약 (3~4일)

**목적:** 검증된 값을 생성이 실제로 쓰게 만든다. todo.txt "다음 할 일 1번"의 구현.

| # | 작업 | 파일 |
| --- | --- | --- |
| 2-1 | `VerifiedValuePack` 타입 + 빌더 | `core/ai/VerifiedValuePack.ts` |
| 2-2 | Preflight 결과 → 팩 변환 | `core/ai/ApprovalSourcePreflight.ts` 출력부 |
| 2-3 | 생성 프롬프트에 팩 주입 | `app/application/EditorialGenerationStrategy.ts` |
| 2-4 | 출처·정보 기준일 본문 표기 지시 | 같은 파일. 사장님 방침 "표시할 수 있으면 최대한 표시" |
| 2-5 | 팩 외 external_fact 발견 시 진단 | `core/ai/AIWorkflow.ts` — 삭제 대신 블록 ID 지목 |
| 2-6 | 프롬프트 길이 정리 | 현재 안전 지시문(63행 단일 문단) 축약 → 토큰 절감 |

**확인:** 실제 원고 2편 생성.
- 본문에 출처명과 정보 기준일이 **실제로 쓰였는가**
- `approvalPolicy` 체크가 `blocked` → `passed`로 바뀌는가
- 편당 입력 토큰이 47K 수준으로 내려오는가

---

## Phase 3 — 게이트 통합 (2~3일)

| # | 작업 | 파일 |
| --- | --- | --- |
| 3-1 | `PublishReadinessVerdict` 신설 | `core/approval/PublishReadinessVerdict.ts` |
| 3-2 | `resolution` 필수 타입 설계 | 해결 경로 없는 차단은 타입 단계에서 불가 |
| 3-3 | 기존 6개 상태 → verdict 집계 | quality / evidence / policy / claim / site / structure |
| 3-4 | `ready` / `in_review` 결정을 verdict 기반으로 | `app/api/studio/route.ts:228` |
| 3-5 | 편집기 화면에 차단 사유 + 해결 버튼 노출 | `app/user-flow` — **브라우저로 직접 확인 필수** |

> todo.txt 경고 반영: `app/user-flow` 변경은 단위 테스트로 잡히지 않는다.
> 지난 세션이 두 번 연속 놓쳤다. Chrome 자동화로 실제 화면 전환을 확인한다.

---

## Phase 4 — 결과 테스트 + 복구 (2일)

| # | 작업 |
| --- | --- |
| 4-1 | `tests/outcome/ManuscriptSurvival.test.ts` — 실제 원고 픽스처로 보존율·표 빈칸·dangling 단언 |
| 4-2 | `tests/outcome/BlockingResolvability.test.ts` — 모든 차단에 resolution 존재 |
| 4-3 | 훼손 원고 복구 스크립트 `scripts/restore-withdrawn-surfaces.mjs` |
| 4-4 | 복구 대상 8편 실행 + 사장님 확인 |

> todo.txt가 지목한 `content-mss9s98k-mo7oka` 등 3편은 **다른 컴퓨터의 워크스페이스**에 있다.
> 이 기계의 `studio-data.json`에는 없는 것이 정상이며 유실이 아니다.
> 복구 스크립트는 워크스페이스에 존재하는 콘텐츠만 대상으로 동작하도록 만들어,
> 어느 기계에서 실행해도 그 기계의 데이터만 복원하게 한다.

---

## Phase 5 — 정리 (1일)

| # | 작업 |
| --- | --- |
| 5-1 | Decision Log에 **D-039** 등록 |
| 5-2 | `02_ARCHITECTURE/09_QUALITY_SYSTEM.md`, `07_AI_ARCHITECTURE.md` 반영 |
| 5-3 | 죽은 방어 코드·회귀 테스트 제거 (`splitsAdjacentNumber`, `rowStillCarriesData` 등) |
| 5-4 | `todo.txt` 인수인계 갱신 |
| 5-5 | 미커밋 문서 변경 40여 개 정리 — 현재 `git status`에 문서 수정이 대량으로 떠 있다 |

---

## 일정 요약

| Phase | 기간 | 산출 |
| --- | --- | --- |
| 0 출혈 정지 | 반나절 | **발행 재개** |
| 1 정의 단일화 | 2~3일 | 교착 제거 |
| 2 생성 제약 | 3~4일 | 출처·기준일 본문 표기 |
| 3 게이트 통합 | 2~3일 | 해결 가능한 차단 |
| 4 테스트·복구 | 2일 | 재발 방지 + 원고 복원 |
| 5 정리 | 1일 | 문서 동기화 |
| **합계** | **10~13일** | |

Phase 0만으로도 오늘 발행이 재개될 가능성이 높다. 나머지는 재발 방지다.

---

## 위험과 대응

| 위험 | 대응 |
| --- | --- |
| Phase 0 후 검증 안 된 수치가 원고에 남는다 | Review First / Draft Only 유지. 사람이 검토 후 발행. Phase 2가 근본 해결 |
| taxonomy 기준이 너무 느슨해 승인에 불리 | Phase 1에서 재분류 표를 먼저 제출하고 사장님 판정 후 진행 |
| 기존 322파일 2,006테스트가 대량 실패 | 삭제 동작을 검증하던 테스트는 **의도적으로** 실패한다. Phase별로 정리하고 개수 변화를 보고 |
| Tistory 경로 회귀 | Tistory 코드는 건드리지 않음. Core 공유 경로만 변경되므로 Tistory 원고 1편으로 확인 |
| 복구 스크립트가 원고를 더 망침 | 백업 먼저(`.bright-studio/` 스냅샷), 1편 시범 후 확인, 그다음 일괄 |

---

## 사장님께 여쭐 것 (진행 전 확인 필요)

1. **D-039 승인 여부** — 사후 삭제 폐기와 write-time 제약 전환에 동의하시는지.
2. **Phase 0을 오늘 바로 진행할지** — 발행 재개가 급하시면 Phase 0만 먼저 하고 결과를 보실 수 있습니다.
## 커밋 방침 (2026-08-14 지시 확인)

사장님 지시: **"이상이 없다면 알아서 커밋해."**

- 각 Phase는 아래 3가지가 전부 통과할 때만 커밋한다.
  1. `npx tsc --noEmit` 클린
  2. `npx eslint .` 클린
  3. `npx vitest run tests/unit` 통과 (의도적으로 폐기한 테스트는 같은 커밋에서 정리하고 사유를 커밋 본문에 남긴다)
- 하나라도 실패하면 커밋하지 않고 보고한다.
- `app/user-flow` 변경이 포함된 커밋은 위 3가지에 더해 **브라우저 직접 확인**을 통과해야 한다.
  단위 테스트는 화면 전환을 잡지 못한다 (지난 세션 2회 연속 실패 기록).
- 푸시는 별도 지시가 있을 때만 한다.
- Conventional Commits 유지. 커밋 본문에 변경 사유와 측정값을 남긴다.
