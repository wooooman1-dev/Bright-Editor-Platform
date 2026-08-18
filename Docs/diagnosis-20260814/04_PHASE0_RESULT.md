# Phase 0 실행 결과 — 출혈 정지

실행일: 2026-08-14
승인: D-039 승인, Phase 0~5 전부 진행 (사장님 지시)
상태: **코드 수정 완료 / 검증 미완 / 커밋 대기**

---

## 1. 변경한 파일 (2개)

### `core/approval/GeneratedFactualClaimInventory.ts` (+48 / −8)

| 변경 | 내용 |
| --- | --- |
| 0-1 | 명시 인벤토리 항목의 `removeGeneratedFactualSurface(...)` 호출 제거 (144~146행) |
| 0-2 | untracked-critical 스윕의 `removeGeneratedFactualSurface(...)` 호출 제거 (212행) |
| — | `let document` → `const document`. 이 함수는 이제 문서를 **읽기만** 한다 |
| — | `pruneLongFormStructure`는 무해한 no-op 가드로 유지 (Phase 5에서 제거) |
| — | D-039 근거와 실측값을 주석으로 기록 |

`disposition: "removed"` 값 자체는 그대로 뒀다. 타입이 두 값뿐이고 Phase 1에서
`unsupported`로 개명하기로 되어 있다. 소비자 2곳이 이미 **본문에 문장이 남아 있으면
철회로 세지 않는다**:

- `ApprovalReadiness.optionalEvidenceCheck` — `disposition === "removed" && 본문에 없음`
- `deliberatelyRemovedGeneratedFactualClaimIds` — 같은 조건

→ 삭제를 멈춰도 "14문장 철회됨" 같은 거짓 보고가 생기지 않는다.

### `core/approval/GeneratedClaimBinding.ts` (+28 / −1)

| 변경 | 내용 |
| --- | --- |
| 0-3 | `detectHighRiskScalarTokens`의 duration 검출을 `\d+(개월\|일\|주\|년)` 전체에서 **기한·임계 수식어가 붙은 경우만**으로 축소 |

새 패턴:

```
\d+(개월|일|주|년)\s*(이내|이상|이하|미만|초과|안에|내에|까지)
| (최대|최소|최장|최단)\s*\d+(개월|일|주|년)
```

`동안`·`간`·`마다` 같은 기간 서술어는 제외했다. 글이 스스로 설명하는 길이지
독자가 지켜야 할 한도가 아니기 때문이다.

`rejectedExampleSpans`와 `periodRuleQuantifier`는 그대로 뒀다 — 인용 예시 면제 로직은
계속 유효하다.

---

## 2. 0-4는 하지 않았다 (판단 변경)

계획서의 0-4는 "앵커 소실 차단을 advisory로 낮춘다"였다. **하지 않는 것이 맞다고 판단했다.**

- 앵커가 사라지던 **원인이 스윕이었고, 0-1/0-2로 그 원인이 없어졌다.** 새 원고에서는 발생하지 않는다.
- 이미 훼손된 기존 원고의 앵커 소실은 Phase 4 복구로 원문을 되살려 푸는 것이 맞다.
  검사를 느슨하게 해서 덮는 것은 AGENTS.md §14가 금지하는 방식이다.
- 측정 근거 없이 정합성 검사를 약화하면, 지난 세션이 반복해서 경계한 실수를 그대로 반복한다.

→ **0-4는 Phase 4로 이동**한다.

---

## 3. 실측 검증 (의존성 없이 수행)

저장된 실제 원고(최근 15편)에 새 duration 패턴을 적용해 변화를 측정했다.

```
기존 패턴 검출:      13 건
신규 패턴 검출:       1 건
차단에서 풀리는 건:  12 건
```

### 이제 차단하지 않는 표현 (전부 편집 문구)

| 표현 | 문맥 |
| --- | --- |
| `3개월` | "최근 3개월 사용 내역 기록하기" (섹션 제목) |
| `1개월` / `2개월` | "1개월 전", "2개월 전" (표 헤더) |
| `25일` `26일` `27일` | "월급이 매월 25일에 들어오고, 월세가 26일…" (가상 사례) |
| `2년` | "'2년 근무'라고 한 줄로 적는 대신…" |
| `1년` | "최근 1년 동안 발생한 소득을 유형별로 적습니다" |

### 차단이 풀리는 원고 (기존 차단 사유가 사라짐)

| 콘텐츠 | 기존 차단 사유 | 결과 |
| --- | --- | --- |
| content-msolrz90 (실업급여) | `고위험 사실이 원고에 남아 있습니다: 2년` | **해제** |
| content-mspvpgnq (피부양자) | `고위험 사실이 원고에 남아 있습니다: 1년` ×2 | **해제** |

두 원고 모두 품질 100점인데 이 사유 하나로 막혀 있었다.

### 새로 막히는 원고: 없음

신규 패턴에 걸리는 문장은 전체에서 1건이다.

```
"가능하면 연속된 3개월 이상을 비교하는 편이 낫습니다" (content-mslpwo0c)
```

이 원고는 원래 품질 점수(94점)로 `in_review`였고 Claim 게이트로 막힌 적이 없다
(critical Claim 계획이 없어 정합성 검사가 조기 통과한다). **동작 변화 없음.**

> 다만 이 문장은 남은 오탐이다. 법정 기한이 아니라 글 자신의 권고다.
> Phase 1의 `FactualSurfaceTaxonomy`가 요구하는 **귀속 주체** 조건이 이것을 걸러낸다.

---

## 4. 검증 결과 — 통과 (2026-08-14)

사장님이 실행한 결과 전부 통과했다.

```
npx tsc --noEmit   →  출력 없음 (클린)
npx eslint .       →  출력 없음 (클린)
npx vitest run     →  Test Files 323 passed (323)
                      Tests 2015 passed (2015)
```

직전 실행이 `18 failed | 1997 passed` 였으므로 18건이 전부 해소됐다.
남은 완료 조건은 실제 원고 1편 생성이다 (§7).

### 4-1. 왜 이 환경에서 못 돌렸나 (기록)

이 환경에서 `tsc` / `eslint` / `vitest`를 **실행할 수 없었다.** 이유:

| 시도 | 결과 |
| --- | --- |
| 사장님 기계에서 실행 | 브리지의 리눅스 VM에서 도는데 `node_modules`가 Windows용이라 네이티브 바인딩 로드 실패 (`rolldown-binding.linux-x64-gnu.node` 없음) |
| 클라우드 컨테이너에서 실행 | `npm install`이 레지스트리 제한에 막힘 (`zod-validation-error`, `@tailwindcss/postcss` 403) |
| 마운트 경유 `tsc` | 네트워크 마운트라 10분 넘게 진행되지 않음 |

**사장님 PowerShell에서 아래 3개를 실행해 주세요:**

```powershell
npx tsc --noEmit
npx eslint .
npx vitest run tests/unit
```

예상 결과:

- `tsc`, `eslint` — 클린이어야 한다. 변경이 함수 호출 2줄 제거와 정규식 1개 교체뿐이다.
- `vitest` — **삭제 동작을 검증하던 테스트가 실패한다. 이것은 정상이다.**
  실패 목록을 알려주시면 D-039에 맞게 정리하겠습니다. 예상 대상:
  - `tests/unit/core/approval/GeneratedFactualClaimInventory.test.ts`
    (문장 단위 삭제, 표 셀 보존, `12,0` 방지, dangling ID 방지 — 전부 "삭제가 일어난다"는 전제)
  - `tests/unit/core/approval/GeneratedClaimBinding.test.ts` (기간 검출)
  - `tests/unit/core/ai/AIWorkflowGeneratedClaimBinding.test.ts`

---

## 5. 커밋 상태

두 파일을 **스테이징까지만** 해뒀습니다. 검증 전이라 커밋하지 않았습니다.

```
M  core/approval/GeneratedClaimBinding.ts
M  core/approval/GeneratedFactualClaimInventory.ts
```

검증이 통과하면 (테스트 정리 포함) 이 메시지로 커밋하시거나, 결과를 알려주시면 제가 이어서 하겠습니다:

```
fix: stop withdrawing sentences from the finished manuscript

D-039 Write-time Fact Constraint. 사후 삭제는 D-037이 정한
"같은 Generation Prompt에서 제거하거나 일반화"를 우회한 승인 없는 설계였다.

실측: 인벤토리 48항목 중 43개(90%) 철회, 그중 38개는 disposition이
상수로 removed인 경로였다. 최근 15편 1,499문장 중 금액·비율·날짜·자격
조건이 남은 문장은 6개뿐이었다.

- GeneratedFactualClaimInventory: 문서 변형 제거, 기록만 수행
- GeneratedClaimBinding: duration 검출을 기한·임계 수식어가 있는
  경우로 축소. 실측 13건 → 1건. 품질 100점 원고 2편이 "2년"과
  "1년"으로 막혀 있었고 파이프라인에 그것을 해소할 수단이 없었다.
```

> ⚠️ **`git add -A` / `git commit -a`를 쓰지 마세요.**
> 저장소에 줄바꿈(CRLF) 미정리 파일이 87개 있어서 전부 딸려 들어갑니다.
> 사장님이 "병합 후로 미뤄"라고 지시하신 그 항목입니다. 파일 2개만 명시적으로 add 하세요.

---

## 6. 정리해 주실 것

작업 중 만든 임시 폴더가 남아 있습니다. 이 브리지에서는 파일 삭제가 안 돼서
한곳에 모아만 뒀습니다.

```
F:\Project\bright-editor-platform\_to_delete\
```

안에 든 것: 소스 압축본 2개(검증용), 그리고 git이 남긴 stale `index.lock` 2개.
**폴더째 삭제하시면 됩니다.** 저장소에 필요한 파일은 없습니다.

---

## 7. 다음 단계

1. 위 3개 명령 결과 확인 → 실패 테스트 정리 → 커밋
2. **개발 서버에서 실제 원고 1편 생성** — Phase 0의 진짜 완료 기준
   - 인벤토리 `removed` 항목의 문장이 본문에 **그대로 남아 있는지**
   - 표 빈칸 0개인지
   - `ready`에 도달하는지
3. 도달하면 Phase 1(사실 정의 단일화) 착수
