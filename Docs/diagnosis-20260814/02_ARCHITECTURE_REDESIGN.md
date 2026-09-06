# Bright Editor Platform — 사실 검증 파이프라인 재설계안

작성일: 2026-08-14
전제 문서: `01_ROOT_CAUSE_DIAGNOSIS.md`
승인 대상: Decision Log 신규 결정 **D-039** 로 등록 필요

> 프로젝트 규칙상 이 문서는 **설계안**이며, 승인 전에는 코드를 쓰지 않는다.

---

## 1. 설계 원칙 전환

```
현재:  생성 → (완성된 원고를 잘라냄) → 게이트가 남은 것을 차단
제안:  검증된 값 확보 → 생성이 그 안에서만 씀 → 게이트는 판정만, 문서는 불변
```

한 문장으로: **"쓰고 나서 지운다"를 버리고 "쓰기 전에 정한다"로 되돌린다.**

이것은 새로운 발명이 아니라 **D-037이 이미 결정해 둔 것**이다
("VERIFY는 … 같은 Generation Prompt에서 해당 구체 Claim을 제거하거나 일반화").

### 불변 조건 (설계 전반에 적용)

1. **canonical 문서는 생성 이후 어떤 자동 단계도 수정하지 않는다.**
   수정은 사람의 편집 또는 명시적 재생성으로만 일어난다.
2. **모든 차단에는 실행 가능한 해결 경로가 있어야 한다.**
   사용자가 아무것도 할 수 없는 차단 상태는 만들지 않는다.
3. **"고위험 사실"의 정의는 저장소 전체에 하나만 존재한다.**
4. AI 호출은 계속 Generation 1회 + Quality Review 1회.
   Source Preflight는 별도 예산으로 명시하고 캐시한다 (현재는 몰래 3회째가 되고 있다).
5. Core/Apps/Shared 경계 유지. 아래 신설 모듈은 전부 `core/`에 둔다.

---

## 2. 설계 D1 — 사후 삭제 폐기, 인벤토리는 기록만

### 현재

`core/approval/GeneratedFactualClaimInventory.ts`
→ `applyGeneratedFactualClaimInventory()` 가 문서를 반환하며 **블록·표 셀·제목·메타를 변형**한다.

### 제안

같은 모듈을 두 개로 쪼갠다.

```
core/approval/
  GeneratedFactualClaimInventory.ts   ← 기록만. 문서를 절대 반환하지 않는다
  (삭제) removeGeneratedFactualSurface / findUntrackedCriticalSurfaces 의 문서 변형 경로
```

새 시그니처:

```ts
export function recordGeneratedFactualClaimInventory(input: {
  document: ContentDocument;          // 읽기만 한다
  drafts: readonly Draft[];
  decisions: readonly Decision[];
}): GeneratedFactualClaimInventoryRecord;   // ← 문서를 반환하지 않는다
```

- `disposition`은 `retained` / `unsupported` 로 이름을 바꾼다.
  `removed`는 "지웠다"는 뜻이었지만 이제 아무것도 지우지 않는다.
- 문서 변형 함수(`removeGeneratedFactualSurface`, `rowStillCarriesData`,
  `splitsAdjacentNumber`, `pruneLongFormStructure` 호출)는 **삭제한다.**
  이 함수들은 잘라내기를 안전하게 만들려던 방어 코드이고, 잘라내기가 없어지면 존재 이유가 없다.

### 이렇게 하면 사라지는 것

지난 세션들이 잡은 버그 6종(표 셀 공백, `12,0` 잘린 값, 문단 통째 삭제, 빈 표 껍데기,
고지 오삭제, dangling 구조 ID)이 **원인 자체가 없어져** 재발 불가능해진다.
관련 방어 코드와 회귀 테스트도 함께 정리된다.

### 대신 필요한 것

지워지지 않으므로, 검증 안 된 사실이 원고에 남을 수 있다. 그 처리는 D3·D4가 담당한다.

---

## 3. 설계 D2 — 사실 정의를 하나로 통합

### 신설: `core/approval/FactualSurfaceTaxonomy.ts`

저장소 전체에서 "이 표현이 외부 검증이 필요한 사실인가"를 판정하는 **유일한** 모듈.

```ts
export type FactualSurfaceClass =
  | "external_fact"     // 외부 공식 문서로만 확인 가능 → 검증 필요
  | "editorial_frame"   // 글이 스스로 설명하는 구조어 → 검증 대상 아님
  | "illustrative";     // 가정이 본문에 명시된 예시 → 고지 있으면 허용

export function classifyFactualSurface(
  sentence: string,
  context: { sectionHasCalculationDisclosure: boolean },
): FactualSurfaceClass;
```

### 판정 규칙 (현재 3개 패턴을 대체)

**external_fact 는 다음 3요소가 모두 있을 때만 성립한다:**

| 요소 | 예 |
| --- | --- |
| ① 수치값 | `3.5`, `60,000`, `2026-01-01` |
| ② 단위·유형 | `%`, `원`, `년 N월 N일`, `제N조` |
| ③ 귀속 주체 | 제도명·기관명·상품명 (`실업급여`, `국세청`, `주택청약종합저축`) |

- `우대 조건`, `가입 조건`, `자격 요건` → **값이 없다 → editorial_frame.** 검증 대상 아님.
- `2년`, `3개월` → 단독으로는 editorial_frame.
  단, `\d+(년|개월|일)\s*(이내|이상|이하|미만|초과|안에|까지)` 처럼 **임계·기한 수식어가 붙고**
  귀속 주체가 있으면 external_fact (예: `신고는 14일 이내`).
- 계산 가정 고지가 있는 섹션 안의 수치 → illustrative.
- `정보 기준일:` / `최종 검토일:` → 발행 메타데이터. 분류 대상에서 제외.

### 교체 대상

| 현재 | 교체 후 |
| --- | --- |
| `GeneratedFactualClaimInventory.criticalSurfacePattern` | `classifyFactualSurface(...) === "external_fact"` |
| `GeneratedClaimBinding.detectHighRiskScalarTokens` | 동일 함수 호출 |
| `ExplicitVerificationPreflight` 의 Claim 선정 | 동일 함수 호출 |

세 곳이 같은 함수를 부르면 RC-2의 교착은 **구조적으로 발생 불가능**해진다.
"①은 잡는데 ②는 못 잡는" 상황 자체가 성립하지 않는다.

### 경계 유지

`core/approval/` 안에 두고 플랫폼 의존성 없음. Tistory/WordPress 양쪽이 그대로 쓴다
(AGENTS.md §14 "약한 Tistory 승인 경로를 따로 만들지 않는다" 준수).

---

## 4. 설계 D3 — 제약을 생성 시점으로 이동

### 현재 흐름

```
Source Preflight → 생성 → [사후 삭제] → 게이트
                          ^^^^^^^^^^^^ 여기서 원고가 훼손됨
```

### 제안 흐름

```
Source Preflight → 검증값 팩(Verified Value Pack) → 생성 프롬프트에 주입
                                                    → 생성이 팩 안에서만 수치를 씀
                                                    → 위반 시 삭제가 아니라 진단
```

### Verified Value Pack

Preflight가 이미 공식 출처와 값을 확보하고 있다 (실측: 웹소스 18개 → 공식 3개).
지금은 그 값이 생성 프롬프트에 **구조화되어 들어가지 않는다.** 그래서 생성은 자기 지식으로
숫자를 쓰고, 그걸 나중에 지우는 낭비가 일어난다.

```ts
type VerifiedValuePack = readonly {
  claimId: string;
  subject: string;        // "실업급여 피보험단위기간"
  value: string;          // "180일"
  sourceUrl: string;      // 공식 출처
  sourceName: string;     // "국가법령정보센터"
  informationDate: string;// 정보 기준일
}[];
```

생성 프롬프트 지시:

> 아래 검증된 값 목록에 없는 수치·기간·요율·금액은 본문에 쓰지 않는다.
> 값을 쓸 때는 반드시 함께 제공된 출처명과 정보 기준일을 본문에 표기한다.
> 값이 필요한데 목록에 없으면, 수치 대신 "공식 안내에서 확인" 형태의 안내 문장으로 쓴다.

이것이 사장님이 이미 지시한 **"본문에 출처를 최대한 표시한다"** 방침의 실제 구현이다
(todo.txt "다음 할 일 1번"). 지금은 게이트 쪽(`bodyOffersConfirmationPath`)에만 구현돼 있고
생성 프롬프트는 손대지 않은 상태다.

### 위반 시 처리 (삭제 금지)

생성 결과에 팩 밖의 `external_fact`가 있으면:

| 개수 | 처리 |
| --- | --- |
| 0건 | `ready` 후보 |
| 1~2건 | `in_review` + 해당 블록 ID와 문장을 **정확히 지목**한 진단. 사용자가 편집기에서 고침 |
| 3건 이상 | `in_review` + 재생성 1회 제안 (자동 재생성은 하지 않음 — 비용 정책) |

**어떤 경우에도 문장을 자동으로 지우지 않는다.**

---

## 5. 설계 D4 — 게이트를 하나의 판정으로 합류

### 현재

한 원고에 6개 상태가 독립 저장되고 서로 모순된다 (RC-5).

```
quality.approvalState          approvalEvidence.status
approvalPolicy(blocked)        siteApprovalReadiness
generatedClaimVerification     generationDiagnostic.violations
```

### 신설: `core/approval/PublishReadinessVerdict.ts`

```ts
export type BlockingReason = Readonly<{
  code: string;
  gate: "quality" | "evidence" | "policy" | "claim" | "site" | "structure";
  message: string;          // 무엇이 문제인가
  location?: BlockLocation; // 어느 블록·어느 문장인가
  resolution: Resolution;   // ★ 어떻게 풀 수 있는가 (필수)
}>;

export type Resolution =
  | { kind: "edit_body"; blockId: string; hint: string }
  | { kind: "regenerate"; scope: "section" | "article" }
  | { kind: "add_source"; claimId: string }
  | { kind: "user_decision"; question: string }
  | { kind: "fix_site"; url: string };

export type PublishReadinessVerdict = Readonly<{
  publishable: boolean;
  blocking: readonly BlockingReason[];
  advisory: readonly BlockingReason[];
}>;
```

### 핵심 규칙

**`resolution` 은 옵셔널이 아니다.** 해결 경로를 제시할 수 없는 차단은 코드에서 만들 수 없다.

현재 "`검증되지 않은 고위험 사실이 원고에 남아 있습니다: 2년`" 은 사용자가
- 어느 블록인지는 알지만
- 무엇으로 바꿔야 통과하는지 모르고
- 시스템도 그걸 고칠 수단이 없다

→ 이 형태의 차단은 새 구조에서 **컴파일 단계에서 불가능해진다.**

### 점수와 준비 상태의 분리 유지

AGENTS.md §14 "품질 점수 100점이 사이트 승인 준비를 뜻하지 않는다"는 그대로 지킨다.
`PublishReadinessVerdict`는 점수를 합치는 게 아니라 **차단 사유를 한 곳에 모으는** 구조다.

---

## 6. 설계 D5 — 결과 기반 회귀 테스트

### 문제

단위 테스트 2,006개가 초록인데 원고가 전부 깨진다 (RC-6).
테스트는 함수의 동작을 고정하고, 산출물의 품질은 아무도 고정하지 않는다.

### 신설: `tests/outcome/`

실제 저장된 원고를 픽스처로 넣고 **파이프라인 전체를 통과시켜 산출물을 단언**한다.

```ts
// tests/outcome/ManuscriptSurvival.test.ts
describe("실제 생성 원고가 파이프라인을 지나도 살아남는가", () => {
  for (const fixture of realManuscriptFixtures) {   // studio-data.json 에서 추출
    it(`${fixture.id}: 문장 보존율 ≥ 95%`, ...);
    it(`${fixture.id}: 표 빈칸 0개`, ...);
    it(`${fixture.id}: longFormStructure dangling 참조 0개`, ...);
    it(`${fixture.id}: 본문 문단 수 감소 0`, ...);
  }
});

// tests/outcome/BlockingResolvability.test.ts
it("모든 차단 사유에 resolution 이 있다", ...);
it("어떤 원고도 '해결 불가' 상태로 끝나지 않는다", ...);

// tests/outcome/FactTaxonomyAgreement.test.ts
it("스윕·게이트·프리플라이트가 같은 문장에 같은 판정을 낸다", ...);
```

픽스처는 지금 손에 있다: `.bright-studio/studio-data.json`의 최근 15편.
그중 8편은 이미 훼손된 상태라 **회귀 방지용 음성 케이스**로 그대로 쓸 수 있다.

---

## 7. 설계 D6 — 훼손 원고 복구

`document.metadata.generatedFactualClaimInventory.items[]`에
`surfaceText`(삭제된 원문)와 `locations`(블록 ID)가 남아 있다. **재생성 없이 복원 가능하다.**

복구 대상 (실측, removed > 0):

| 콘텐츠 | 삭제 건수 | 비고 |
| --- | --- | --- |
| content-msn722jz | 18 | 본문 1,157자만 남음. 최우선 |
| content-mssubxwf | 9 | 8/14 생성 |
| content-msrfq4gt | 7 | 국민연금 |
| content-mslrf8a7 | 3 | |
| content-msolrz90 | 2 | |
| content-msosej4k | 2 | |
| content-mslyfk99 | 1 | |
| content-msou2crv | 1 | 앵커 소실로 차단 중 |

복구는 스크립트 1회 실행 + 사용자 확인. `scripts/restore-withdrawn-surfaces.mjs` 신설.

> 참고: todo.txt가 지목한 `content-mss9s98k-mo7oka`, `content-msoc80eo-qwbi43`,
> `content-msmjpvq5-tjoeah`는 **다른 컴퓨터의 워크스페이스**에 있다 (프로젝트 ID도
> `project-ms6sj39z-tmd83k`로 다르다). 이 기계의 데이터에 없는 것이 정상이며 유실이 아니다.
> 복구 스크립트는 실행하는 기계의 `studio-data.json`에 존재하는 콘텐츠만 대상으로 하고,
> 없는 ID는 조용히 건너뛰지 말고 "이 워크스페이스에 없음"으로 보고한다.

---

## 8. 설계 D7 — 비용 정책 명시

현재 AI 호출이 문서상 2회, 실제 최대 3회다 (Source Preflight가 세지 않고 있음).
입력 토큰이 4일 만에 3.4배로 늘었다.

제안:

- Source Preflight를 **정식 3번째 호출로 문서화**하되, `claimDefinitionFingerprint` 기준으로
  **프로젝트 단위 캐시**를 둔다. 같은 제도(실업급여, 국민연금)를 다루는 글이 반복 검색하지 않게.
- Verified Value Pack이 생기면 생성 프롬프트의 장황한 안전 지시문을 줄일 수 있다
  (현재 `EditorialGenerationStrategy.ts:63`의 단일 문단 안전 지시가 매우 길다).
- 목표: 편당 입력 토큰을 8/10 수준(≈47K)으로 되돌린다.

---

## 9. 변경 요약

| 구분 | 파일 | 변경 |
| --- | --- | --- |
| 신설 | `core/approval/FactualSurfaceTaxonomy.ts` | 사실 정의 단일화 |
| 신설 | `core/approval/PublishReadinessVerdict.ts` | 차단 판정 통합 |
| 신설 | `core/ai/VerifiedValuePack.ts` | 검증값 → 프롬프트 |
| 신설 | `tests/outcome/*` | 산출물 회귀 |
| 신설 | `scripts/restore-withdrawn-surfaces.mjs` | 복구 |
| 대폭 축소 | `core/approval/GeneratedFactualClaimInventory.ts` | 문서 변형 제거 |
| 수정 | `core/approval/GeneratedClaimBinding.ts` | taxonomy 호출로 교체 |
| 수정 | `core/ai/AIWorkflow.ts` | 스윕 호출 제거, 팩 주입 |
| 수정 | `core/ai/GeneratedVerifyEvidence.ts` | 7단계 AND → 단계별 진단 보고 |
| 수정 | `app/application/EditorialGenerationStrategy.ts` | 프롬프트에 팩 반영 |
| 수정 | `app/api/studio/route.ts` | verdict 기반 상태 결정 |
| 문서 | `Docs/current/00_FOUNDATION/08_DECISION_LOG.md` | **D-039 등록** |
| 문서 | `Docs/current/02_ARCHITECTURE/09_QUALITY_SYSTEM.md` 외 | 반영 |

---

## 10. 승인이 필요한 결정 (D-039 초안)

> **D-039 Write-time Fact Constraint**
>
> Status: Proposed
>
> 생성된 canonical 원고는 어떤 자동 단계도 수정하지 않는다. 사실 검증은 생성 이후의
> 삭제가 아니라 생성 이전의 값 확보와 생성 시점의 제약으로 수행한다. D-037이 정한
> "같은 Generation Prompt에서 제거하거나 일반화한다"를 구현으로 확정하고,
> 사후 문서 변형(factual inventory sweep)을 폐기한다.
>
> 외부 검증이 필요한 사실의 정의는 저장소에 하나만 둔다. 수치값·단위·귀속 주체가
> 모두 있을 때만 external_fact 로 판정하며, 값 없는 조건·자격 표현과 기한 수식어 없는
> 기간 표현은 검증 대상이 아니다.
>
> 모든 발행 차단 사유는 실행 가능한 해결 경로를 함께 제시해야 한다. 해결 경로가 없는
> 차단 상태는 만들지 않는다.
>
> AI 호출은 Generation 1회 + Quality Review 1회를 유지하고, Source Preflight를
> 세 번째 호출로 명시하되 Claim 지문 기준 프로젝트 캐시를 적용한다.

**이 결정을 승인해 주시면 D1~D7 구현에 들어갑니다.**
