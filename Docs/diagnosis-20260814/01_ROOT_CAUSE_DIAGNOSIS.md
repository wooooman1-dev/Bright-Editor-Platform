# Bright Editor Platform — 원고 생성 반복 실패 근본 원인 진단

작성일: 2026-08-14
대상 브랜치: `feat/scheduled-publishing-and-diversity` (bb2e55a)
근거: `F:\Project\bright-editor-platform` 실제 코드 + `.bright-studio/studio-data.json` 실측 (콘텐츠 52편)

> 이 문서의 모든 수치는 추정이 아니라 저장된 데이터를 스크립트로 집계한 값이다.
> 재현 스크립트는 부록 A에 있다.

---

## 0. 한 줄 요약

원고가 깨지는 이유는 개별 버그가 아니다. **완성된 원고에서 문장을 사후에 잘라내는 설계**가
Decision Log D-037을 위반한 채 들어와 있고, 그 삭제기와 발행 게이트가 "고위험 사실"을
서로 다르게 정의해서 **아무도 풀 수 없는 교착**을 만든다. 지난 며칠의 수정은 전부 이 설계에서
파생된 증상을 하나씩 막은 것이라, 다음 원고에서 다음 증상이 나온다.

---

## 1. 현재 상태 실측

### 1.1 발행이 멈춘 시점

| 항목 | 값 |
| --- | --- |
| 마지막 발행 성공 | **2026-08-10 13:18** (WordPress, content-msn722jz, external post 89) |
| 그 이후 발행 시도 기록 | **0건** (`publishingRecords` 7건 중 8/10 이후 없음) |
| 8/11~8/14 생성된 원고 | 8편 |
| 그중 `ready` 도달 | 1편 (content-msor00aj) |
| 그중 실제 발행 | **0편** |

### 1.2 소모된 비용

`document.metadata.aiUsage` 집계 (16편 기록 보유):

| 기간 | 입력 토큰/편 | AI 호출/편 | 발행 도달 |
| --- | --- | --- | --- |
| 8/08 ~ 8/10 | 32,368 → 47,309 | 2회 | 성공 |
| 8/11 ~ 8/14 | 50,249 → **110,363** | **2~3회** | **0편** |

- 8/11 이후 8편에 입력 539,856 토큰 + 출력 89,558 토큰 소모, 발행 0편.
- 편당 입력 토큰이 4일 만에 **3.4배**로 늘었다. 출력 길이는 그대로다.
- AGENTS.md와 프로젝트 지침이 명시한 "생성 1회 + 리뷰 1회" 정책과 달리 **3회 호출**이
  기록된 콘텐츠가 4편 있다 (Source Preflight 호출이 추가됨).

### 1.3 원고에 남아 있는 것

최근 15편(8/09~8/14), 문장 1,499개를 `criticalSurfacePattern`으로 검사한 결과:

> **금액·백분율·연월일·자격/조건 표현을 포함한 문장이 1,499개 중 6개만 남아 있다.**

생활경제·세금·정부지원을 다루는 사이트에서 숫자와 조건이 사실상 전멸했다.
`14_ADSENSE_APPROVAL_CONTENT_POLICY.md`가 요구하는 "공식 출처 · 정보 기준일 · 검토일"이
본문에 없는 이유가 이것이다. **생성이 안 쓴 게 아니라, 쓴 것을 파이프라인이 지웠다.**

### 1.4 사실 인벤토리 처리 결과

전체 콘텐츠의 `generatedFactualClaimInventory` 항목 48개:

| 처분 | 건수 | 비율 | diagnosticCode |
| --- | --- | --- | --- |
| **removed** | **43** | **90%** | |
| ├ 스윕이 생성 | 38 | 79% | `unreported_generated_critical` |
| ├ 인용 미확인 | 2 | 4% | `verify_source_not_cited_by_generation` |
| ├ 앵커 미확인 | 2 | 4% | `verify_evidence_anchor_unverified` |
| └ 계획 링크 무효 | 1 | 2% | `verify_planning_claim_link_invalid` |
| retained | 5 | 10% | |

**보존율 10%.** 그리고 삭제의 79%는 "검증에 실패한" 것이 아니라 **애초에 검증 대상이 될 수
없는** 항목이다 (§2.3 참조).

### 1.5 발행이 막히는 실제 사유

`qualityReports` 실측 — 점수는 만점인데 차단된 원고들:

| 콘텐츠 | overallScore | approved | 차단 사유 (원문) |
| --- | --- | --- | --- |
| content-msolrz90 (실업급여) | **100** | false | `검증되지 않은 고위험 사실이 원고에 남아 있습니다: 2년 (block:section-2-paragraph-4)` |
| content-mspvpgnq (피부양자) | **100** | false | `검증되지 않은 고위험 사실이 원고에 남아 있습니다: 1년 (block:section-3-paragraph-3)` |
| content-msou2crv (휴면예금) | **100** | false | `Generation 구조화 Claim의 verbatim anchor를 현재 원고에서 찾지 못했습니다: verification-claim-2b494ed0` |
| content-mslqob24 (비상금) | **100** | false | `목차 범위: 목차가 확정된 주제의 핵심 범위를 구성하지 않습니다` |
| content-msosej4k (청약통장) | 87 | false | `완성된 글이 아니라 작성 계획이나 지시문이 본문에 포함되어 있습니다` |

**"2년"이라는 단어 하나 때문에 품질 100점 원고가 영구 차단된다.**
그리고 이 차단은 재생성으로도 풀리지 않는다 — 이유는 §2.2에 있다.

---

## 2. 근본 원인

### RC-1. 사후 삭제 설계가 Decision Log를 위반한 채 들어와 있다 ★최상위★

Decision Log `D-037 Claim-context Source Authority` (프로젝트 최상위 Source of Truth) 원문:

> NONE은 Evidence N/A, **VERIFY는 실패 시 전체 Generation을 차단하지 않고 같은 Generation
> Prompt에서 해당 구체 Claim을 제거하거나 일반화하며**, CRITICAL에만 mandatory Source
> Preflight와 Generation Gate를 적용한다.

승인된 설계는 **생성 프롬프트 안에서** 해결하라는 것이다.
실제 구현은 `core/approval/GeneratedFactualClaimInventory.ts`가
**완성된 canonical 문서를 문자열 치환으로 잘라낸다**.

- Decision Log 전체(D-001~D-038)에 사후 삭제 스윕을 승인한 결정은 **없다**.
- AGENTS.md §3 금지 항목: `Change architecture without approval`, `Break existing functionality`.
- 프로젝트 지침: `Never write code before user approval` / `Protect existing features`.

**지난 며칠 잡은 버그가 전부 이 하나에서 파생됐다:**

| 지난 세션이 고친 증상 | 실제 발생 지점 |
| --- | --- |
| 비교 표 15칸 중 14칸 공백 | 표 셀에 문자열 치환 적용 |
| `12,060,000원` → `12,0` | `value.replace(surfaceText, " ")` |
| 문단 통째 삭제 | 블록 전체를 하나의 surface로 전달 |
| 라벨만 남은 빈 표 껍데기 | 행 전체가 비워짐 |
| 고지 문단이 먼저 삭제됨 | 고지가 날짜/금액 패턴에 걸림 |
| `longFormStructure` dangling ID | 삭제로 블록이 사라짐 |

전부 "잘라내기"의 부작용이다. 잘라내기를 유지하는 한 다음 부작용이 나온다.

---

### RC-2. "고위험 사실"의 정의가 3개로 갈라져 서로 모순된다 ★교착의 원인★

같은 파이프라인 안에 독립적인 판정기가 3개 있다.

| # | 위치 | 무엇을 잡나 | 결과 |
| --- | --- | --- | --- |
| ① | `GeneratedFactualClaimInventory.ts:445` `criticalSurfacePattern` | 금액, %, 연월일, **자격 요건 / 신청 조건 / 가입 조건 / 우대 조건 / 해지 조건 / 상품 조건 / 연회비 / ~법** | 문장 **삭제** |
| ② | `GeneratedClaimBinding.ts:347` `detectHighRiskScalarTokens` | 금액, %, 날짜, 제N조, **기간 (N년 / N개월 / N일 / N주)** | 원고 **차단** |
| ③ | `ExplicitVerificationPreflight.ts` | 계획서에 등록된 Claim만 | 생성 **중단** |

**①은 "2년"을 못 잡는다. ②는 "우대 조건"을 못 잡는다.**

그 결과:

```
①이 지운 문장  = ②가 요구한 적 없는 것        → 순손실
②가 막는 표현  = ①이 지울 수 없는 것          → 영구 차단
```

**실측 확인:** content-msolrz90(실업급여)은 "2년" 때문에 blocked인데, 인벤토리 스윕은 그
문장을 손대지 않았다(removed 2건 모두 다른 문장). 파이프라인 안의 어떤 단계도 이 "2년"을
처리하지 못하므로, 몇 번을 재생성해도 같은 자리에서 막힌다.

②의 `duration` 검출은 `\d+\s*(개월|일|주|년)` 전체다. 예외는 "인용 후 부정한 예시" 하나뿐이다.
생활경제 글에서 "3개월", "1년", "14일"을 안 쓰는 것은 불가능하다.

---

### RC-3. 삭제의 79%는 검증 통과가 수학적으로 불가능하다

`applyGeneratedFactualClaimInventory` 155~180행:

```ts
for (const surface of findUntrackedCriticalSurfaces(document, retainedCriticalSurfaces)) {
  const claimId = verificationClaimId({ field: "generated:untracked-critical", ... });
  items.push(Object.freeze({
    ...
    disposition: "removed" as const,        // ← 하드코딩
    evidenceStatus: "unsupported" as const,
    diagnosticCode: "unreported_generated_critical",
  }));
  document = removeGeneratedFactualSurface(document, surface, input.fallbackTitle);
}
```

- 이 항목들은 `decisions` 배열을 **거치지 않는다**. 검증 함수에 도달조차 안 한다.
- `claimId`는 그 자리에서 합성되므로 `verifiedCriticalClaimIds`에 절대 존재할 수 없다.
- 즉 `disposition: "removed"`가 **코드에 상수로 박혀 있다.**

이것은 검증 게이트가 아니라 **무조건 삭제기**다. 실측 38/48(79%)이 이 경로다.

한편 정상 경로(VERIFY)의 보존 조건은 7단계 AND 체인이다
(`core/ai/GeneratedVerifyEvidence.ts`):

1. `planningClaimId`가 사전 계획에 등록돼 있을 것
2. `evidenceUrl`이 **이번 생성 호출 자신의 웹검색 인용**에 `provenance === "citation"`으로 있을 것
3. excerpt 비어있지 않을 것
4. 페이지 fetch 200 + 본문 추출 성공
5. 프로필 공식 출처 허용 목록 통과
6. excerpt가 페이지 본문에 **정규화 후 그대로** 포함될 것
7. relevance passed **그리고** 토큰 겹침 ≥ 35%

7개 모두 통과해야 문장 하나가 살아남는다. 실측 보존율 10%는 이 구조의 자연스러운 결과다.

---

### RC-4. 스윕이 지우는 것은 사실이 아니라 이 사이트의 주제어다

실제로 삭제된 문장들 (`surfaceText` 원문):

| 콘텐츠 | 삭제된 문장 | 이게 사실 주장인가 |
| --- | --- | --- |
| 예금적금 비교 | "예금 적금 비교 방법을 금리만이 아닌 목돈 여부, 월 저축 계획, 사용 예정일, 중도해지 조건, 세전 세후 이자 비교 기준으로 정리합니다." | **글의 리드 문장.** 아무것도 주장하지 않는다 |
| 예금적금 비교 | "기본 조건과 우대 조건을 분리해 기록한다" | **체크리스트 항목** |
| 국민연금 | "가장 주의할 점은 예상액을 확정된 지급액으로 사용하지 않는 것입니다." | **주의 고지.** 정책이 권장하는 문장 |
| 적금 중도해지 | "판단이 남으면 고객센터에 해지일 기준 예상 수령액과 우대 조건 반영 여부를 확인한 뒤 최종 선택합니다." | **행동 안내** |

패턴이 잡는 것은 `자격 요건`, `신청 조건`, `가입 조건`, `우대 조건`, `해지 조건` 같은
**값 없는 명사구**다. 숫자가 하나도 없어도 걸린다.

밝은재테크 프로젝트의 주제 목록이 실업급여 수급자격 / 청약통장 해지 / 피부양자 자격 조건 /
월세 세액공제 조건이다. **주제를 제대로 다루면 반드시 삭제되는 구조**다.

결과: content-msn722jz(예금 적금 비교)는 18건 삭제 후 문단 7개 / 1,157자만 남았다.
같은 시기 정상 원고는 4,000~5,000자다.

---

### RC-5. 게이트끼리 서로의 판단을 모른다

한 원고에 대해 6개 상태가 독립적으로 계산되고, 서로 모순된 값을 갖는다.

**실측 모순 (content-mssubxwf, 적금 중도해지 이자, 8/14):**

| 서브시스템 | 판단 |
| --- | --- |
| `approvalEvidence.status` | `not_required` — 출처 **불필요** |
| `approvalEvidence.sources` | `[]` — 출처 **0개 수집** |
| 인벤토리 스윕 | 9개 문장을 **"출처 없음"으로 삭제** |
| `qualityReport.overallScore` | 100 |

한 서브시스템은 "이 글은 출처가 필요 없다"고 판정했고, 같은 실행 안의 다른 서브시스템은
"출처가 없으니 지운다"고 문장을 잘랐다. **출처가 필요 없다고 판정했으니 출처를 안 모았고,
출처를 안 모았으니 허용 목록이 비었고, 허용 목록이 비었으니 전부 지웠다.**

동일 패턴이 content-msrfq4gt(국민연금, evidence `not_required` / 7건 삭제)에서도 확인된다.

부수 효과 하나 더: 스윕이 문장을 지우면 `generatedClaimVerification`이 가리키던 앵커가
사라져서 `verbatim anchor를 현재 원고에서 찾지 못했습니다`로 **다시 차단**된다
(content-msou2crv 실측). 자기가 지운 것을 자기가 다시 문제 삼는다.

---

### RC-6. 테스트는 초록인데 제품은 망가져 있다

- `npx vitest run tests/unit` 322파일 2,006테스트 통과 (todo.txt 기록)
- `npx tsc --noEmit`, `npx eslint .` 클린
- 테스트 코드 44,196줄 vs 제품 코드 (core+app+apps) 50,610줄

테스트가 검증하는 것: **함수의 기계적 동작** — 문장 단위로 자르는가, 인접 숫자를 훼손하지
않는가, dangling ID가 남지 않는가.

테스트가 검증하지 않는 것: **원고가 살아남았는가.**

- 문장 보존율
- 표 빈칸 개수
- 게이트 통과율
- 발행 도달률
- 차단 사유에 해결 경로가 있는가

지난 세션이 회귀 테스트 11개를 추가했는데도 그다음 원고가 또 깨진 이유가 이것이다.
**단위 테스트가 초록인 것과 원고가 발행되는 것 사이에 아무 연결이 없다.**

---

## 3. 인과 사슬 정리

```
D-037은 "생성 프롬프트에서 해결하라"고 결정
        ↓ (승인 없이 우회)
완성된 원고를 사후에 잘라내는 스윕 도입                    [RC-1]
        ↓
스윕의 패턴이 주제어(조건·자격)를 사실로 오인               [RC-4]
        ↓
검증 경로가 없는 항목을 만들어 무조건 삭제 (79%)            [RC-3]
        ↓
원고에서 숫자·조건·고지가 사라짐 (1,499문장 중 6개 생존)
        ↓
승인 정책이 요구하는 출처·정보 기준일이 본문에 없음
        ↓
한편 게이트는 다른 패턴으로 "2년"을 차단                    [RC-2]
        ↓
스윕은 "2년"을 못 지우고, 게이트는 "우대 조건"을 안 본다
        ↓
        ══ 교착: 재생성으로도 풀리지 않음 ══
        ↓
품질 100점 / approved=false / 발행 0편 / 토큰 63만 소모
        ↓
단위 테스트는 전부 초록이라 아무도 못 잡는다                [RC-6]
```

---

## 4. 지금 당장 확인 가능한 사실 vs 재현이 필요한 것

**확정 (저장 데이터로 확인됨)**
- 보존율 10%, 삭제 79%가 검증 불가 경로
- "2년"으로 인한 품질 게이트 차단
- evidence `not_required`와 스윕 삭제의 동시 발생
- 8/10 이후 발행 0건
- 토큰 3.4배 증가

**재현 1회가 필요한 것**
- 월세 세액공제 원고의 `claim_normalization_failed`
  (todo.txt에 기록됨 — 진단에 `claim.value`가 안 남아서 정규화 결함인지 프롬프트 결함인지 구분 불가)
- Phase 0 수정 후 실제로 발행까지 도달하는지

---

## 부록 A. 재현 스크립트

```js
// 보존율 집계
const d = JSON.parse(fs.readFileSync('.bright-studio/studio-data.json','utf8'))
            .data.application['user-data'];
let items=0, removed=0; const codes={};
for (const c of d.contents) {
  const inv = c.document?.metadata?.generatedFactualClaimInventory;
  if (!inv) continue;
  for (const it of inv.items ?? []) {
    items++;
    if (it.disposition === 'removed') { removed++; codes[it.diagnosticCode] = (codes[it.diagnosticCode]||0)+1; }
  }
}
console.log(items, removed, codes);
```

```js
// 남아 있는 고위험 문장 수 (criticalSurfacePattern 을 그대로 복사해 사용)
// 최근 15편 1,499문장 중 6개
```

## 부록 B. 관련 파일

| 파일 | 역할 | 문제 |
| --- | --- | --- |
| `core/approval/GeneratedFactualClaimInventory.ts` | 사후 삭제 | RC-1, RC-3, RC-4 |
| `core/ai/GeneratedVerifyEvidence.ts` | VERIFY 판정 | RC-3 (7단계 AND) |
| `core/approval/GeneratedClaimBinding.ts` | 게이트 검출 | RC-2 (duration) |
| `core/approval/GeneratedClaimVerificationIntegrity.ts` | 차단 판정 | RC-2, RC-5 |
| `core/ai/AIWorkflow.ts:270-289` | 스윕 호출 지점 | RC-1 |
| `app/api/studio/route.ts:228-268` | ready / in_review 결정 | RC-5 |
| `Docs/current/00_FOUNDATION/08_DECISION_LOG.md` D-037 | 승인된 설계 | 위반 대상 |
