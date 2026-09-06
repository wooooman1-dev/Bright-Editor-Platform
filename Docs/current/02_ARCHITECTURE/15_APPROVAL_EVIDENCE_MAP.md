# 승인 근거·Claim 코드 지도

`core/approval` 46개 파일 10,377줄이 무엇을 하는지, 어느 관문이 무엇을 막는지.

앵커는 **식별자**다. 줄 번호는 쓰지 않는다 — 커밋 하나에 깨지고, 낡은 지도는
없는 것보다 나쁘다. 찾을 때는 `grep -rn '<식별자>' core/approval app`.

**이 지도는 색인이지 진실이 아니다.** 위치를 찾는 데 쓰고, 고치기 직전에 그 파일을
실제로 읽는다.

---

## 1. 이 계열이 하는 일

AdSense 승인 준비(`contentPurpose: adsense_approval`) 원고에만 적용된다. 일반
콘텐츠는 이 계열을 통과하지 않는다.

목적은 하나다 — **원고가 말하는 사실이 공식 출처에서 왔는지 서버가 책임지는 것.**
모델이 자기 지식으로 금액·기한·요건을 쓰지 못하게 하고, 쓴 값에는 출처를 붙인다.

적용 여부는 `approvalPolicySnapshotFromEditorialContext` 가 편집 맥락 문자열에서
`Content purpose: adsense_approval` 을 찾아 정한다. 없으면 스냅샷이 `undefined` 이고
아래 관문이 전부 꺼진다.

---

## 2. 관문 다섯 개

원고 한 편이 지나는 순서다.

### ① Planning — Claim 계약을 만든다

`attachApprovalEvidenceContracts` / `ensureApprovalEvidenceContract`
(`app/application/ContentPlanningStrategy.ts`)

기획 후보에 `verificationPlan.claims` 를 붙인다. 각 Claim 은
`VerificationClaimSpec` 이며 `claimId`, `field`, `kind`, `statement`,
`qualifiers`, `temporalRequirement`, `required`, `risk` 를 가진다.
`kind` 는 `money | ratio | date | dateRange | duration | location | eligibility | legal | general`.

여기서 만들어진 Claim 이 뒤의 모든 관문의 기준이 된다. **Claim 이 없으면 검증할
대상도 없다.**

### ② Preflight — 출처를 찾아 가져온다

`runApprovalSourcePreflight` (`core/ai/ApprovalSourcePreflight.ts`)

`AIWorkflow.generate` 안에서 승인 스냅샷 + 구조화 생성 + Opportunity 세 조건이
모두 참일 때만 돈다. **여기가 이 계열에서 가장 비싼 곳이다** (5장).

흐름: discovery(AI 호출) → URL 안전성 → 페이지 fetch → 본문 추출 → 공식성 판정
→ 주제 관련성 → Claim 커버리지 평가.

실패하면 `ApprovalSourcePreflightError` 를 던져 **생성 자체가 시작되지 않는다.**
거부 단계와 코드:

| `rejectionStage` | `rejectionCode` |
| --- | --- |
| `contract` | `planning_contract_missing` |
| `normalize` | `canonical_url_invalid`, `source_url_unsafe`, `source_url_script_rendered_view` |
| `parse` | `source_fetch_failed`, `source_document_extraction_failed`, `source_shape_invalid` |
| `relevance` | `source_topic_relevance_unverified` |
| `coverage` | `coverage_incomplete` |

discovery 는 최대 2회 시도한다 (`explicitDiscoveryMaximumAttempts`). 1회차에서
거부된 URL과 근거를 못 채운 Claim 을 되먹여 다시 부른다.

공식성 판정은 `ApprovalOfficialSourcePolicy` — `approvalSourceTier`,
`officialDomainAllowed`, `publicSectorDomainAllowed`, `approvalSourceTrusted`.
허용 도메인 목록이 `wordpressLifeEconomyOfficialDomains` 와
`koreanFinancialInstitutionDomains` 에 있다. **여기 없는 기관은 아무리 공식이어도
거부된다** — 2026-08-28 에 `nps.or.kr`, `nhis.or.kr`, `comwel.or.kr` 등을 추가한
이유가 이것이다.

### ③ Generation — 번들을 주입하고 결과를 검사한다

`requireExplicitVerificationGenerationBundle`, `requireApprovalGenerationEvidence`
(`core/ai/VerificationGenerationBundle.ts`, `core/ai/AIWorkflow.ts`)

Preflight 결과를 생성 지시문에 넣는다. 두 갈래다.

- **Claim 계약 번들** — 검증된 Claim 의 `normalizedValue` 를 권위값으로 준다.
- **Fetched passages** — 서버가 실제로 읽은 발췌를 Claim 판정과 무관하게 전부 준다.
  `withApprovalSourcePreflightInstruction` 의 `fetchedSourcePassages`.
  2026-08-27 까지 canonical 분기가 이걸 안 넘겨서, 서버가 가져온 숫자가 생성에
  한 글자도 가지 않았다 (D-045 보완).

생성 뒤 `bindGeneratedClaims` (`GeneratedClaimBinding`) 가 본문의 수치를 Claim 에
연결한다. **허용 목록은 verified Claim 에서만 만들어진다** — 내용 대조를 걷어낸
뒤로 verified 가 되는 Claim 이 없어 허용 목록이 항상 비고, 그래서 본문의 모든
수치가 경고가 됐다. 이 오탐은 `ApprovalEvidenceScalarPresence` 로 걸러낸다.

### ④ Quality Review — 새 사실 추가를 막는다

`guardQualityReviewFactualClaims` (`QualityReviewFactualGuard`)
`evaluateApprovalPreparationText` (`ApprovalLegalScopePolicy`)
둘 다 `EditorialQualityPipeline` 에서 불린다.

**검토 단계는 두 번째 Claim 작성·근거 수집 단계가 될 수 없다.** 후보가 인벤토리에
없는 "값을 말하는 문장" 을 담으면 `findUntrackedCriticalSurfaces` 가 잡아
`quality_unverified_critical_surface_added` 로 **후보를 통째로 거부**한다.

거부 사유: `quality_new_factual_claim_added`,
`quality_factual_claim_contract_changed`, `quality_verified_factual_surface_changed`,
`quality_verified_factual_surface_missing`, `quality_verified_factual_claim_omitted`,
`quality_unverified_critical_surface_added`.

이 가드는 `current.metadata.generatedFactualClaimInventory` 가 있을 때만 작동한다.
**이것이 개선 AI 에 발췌를 넘기면 안 되는 이유다** (D-051).

### ⑤ Readiness — 발행 전 여섯 가지를 본다

`ApprovalReadinessApplicationService.execute`
(`app/application/approval/ApprovalReadinessApplicationServiceBase.ts`)

검사 항목 (`approvalReadinessCheckKeys`):

| 키 | 화면 이름 |
| --- | --- |
| `standard_quality` | 원고 품질 |
| `approval_policy` | 승인 정책 |
| `evidence` | 공식 출처 검증 |
| `duplicate` | 기존 콘텐츠 중복 |
| `internal_links` | 내부 링크 |
| `site_readiness` | 사이트 준비 상태 |

각 항목 상태는 `passed | needs_review | blocked | not_evaluated`.
`fetchApprovalSourcePages` 로 인용 URL 을 다시 열고 `verifyApprovalEvidence` 로
도달성과 도메인 등급을 확인한다. **페이지 내용과 원고 Claim 의 일치는 보지
않는다** (D-045).

검사 계약에 버전이 있다 — `approvalReadinessInspectionVersion`. 저장된 결과는 같은
버전일 때만 오늘의 규칙과 비교 가능하다.

Tistory 발행 경로에는 `assertApprovalDraftIntegrity` 가 따로 걸려 있다
(`app/api/tistory/route.ts`).

---

## 3. 데이터 모델

| 이름 | 어디 사는가 | 무엇인가 |
| --- | --- | --- |
| `ApprovalPolicySnapshot` | `ApprovalPolicy` | 승인 정책·프로필·사이트 정체성. 프롬프트 맥락(`approvalPolicyPromptContext`)의 원천 |
| `VerificationClaimSpec` | `VerificationClaim` | Planning 이 만든 검증 대상 하나 |
| `ApprovalEvidencePack` | `ContentMetadata.approvalEvidence` | 가져온 출처 묶음. `sources[]` 에 `citationExcerpt`, `facts`, 도달성·공식성 상태 |
| `GeneratedFactualClaimInventory` | `ContentMetadata.generatedFactualClaimInventory` | 생성이 확정한 사실 목록. ④ 가드의 기준 |

`ApprovalEvidencePack` 은 `contentDocumentAIContext` 에서 **제외된다**. 그래서 생성
이후 AI 호출은 발췌를 못 본다 — `withStoredEvidencePassagesInstruction` 이 revise
에만 다시 넣어준다 (D-051).

---

## 4. 파일 지도 (역할별)

**정책·판정 기준**
`ApprovalPolicy` · `ApprovalOfficialSourcePolicy` · `ApprovalSourceAuthority` ·
`ApprovalSourceUrlPolicy` · `ApprovalLegalScopePolicy(+Base)` ·
`ApprovalEvidenceClaimPolicy(+Base)` · `VerificationClaim` · `VerificationClaimPolicy` ·
`VerificationTemporalPolicy` · `ApprovalDuplicatePolicy`

`(+Base)` 는 같은 이름의 `...Base.ts` 가 짝으로 있다는 뜻이다. Base 가 기본 규칙을
담고 바깥 파일이 프로필별로 덧붙인다 (예: `wordpress_life_economy_v1`).
`index.ts` 는 barrel 이다.

**출처 수집·검증**
`ApprovalEvidenceVerification`(899줄, 최대) · `ApprovalEvidenceSelection` ·
`ApprovalSourceDocumentAdapter` · `ApprovalSourceDocumentServerAdapter` ·
`ApprovalRequiredEvidenceCandidates` · `ApprovalEvidenceAnchor` ·
`ApprovalEvidenceRequirement` · `PublicPageIndexability`

**Preflight 커버리지**
`ApprovalSourcePreflightCoverage`(892줄) · `ApprovalSourcePreflightClaimScope` ·
`ApprovalSourcePreflightRelevance` · `ApprovalSourcePreflightDiagnostic` ·
`ExplicitVerificationPreflight`

**생성 결과 검사**
`GeneratedClaimBinding` · `GeneratedFactualClaim` ·
`GeneratedFactualClaimInventory` · `GeneratedClaimVerificationIntegrity` ·
`FactualSurfaceTaxonomy` · `QualityReviewFactualGuard` ·
`VerificationGenerationEvidence` · `VerificationGenerationGate` ·
`VerificationClaimEvidenceMatch` · `ApprovalEvidenceScalarPresence`

**발행 전 준비**
`ApprovalReadiness`(690줄) · `ApprovalReadinessDerivation` ·
`SiteApprovalReadinessAdapter`

**표시·부속**
`ApprovalSourceLabel` · `ApprovalSourcePresentation` · `ApprovalDateOwnership` ·
`StoredEvidencePassages` · `VerificationSourceIdentity` ·
`VerificationClaimNormalizer` · `VerificationClaimFingerprint`

---

## 5. 비용

원고 한 편의 AI 호출에서 **preflight 가 가장 크다.** 2026-08-28 실측:

| 원고 | preflight 토큰 | 전체 대비 | 결과 수치 |
| --- | --- | --- | --- |
| 근로장려금 | 27,622 | 32% | 26개 |
| 국민연금 (8/24) | 84,661 | 62% | 1개 |
| 국민연금 (8/28) | 58,088 | 38% | 3개 |

**쓴 토큰과 결과가 반대로 간다.** 지시문 크기를 키우는 요인은
`approvalSourceDiscoveryInstruction` 이 담는 것들이다 — 허용 도메인 목록
(`approvalOfficialDomains`), 기획 범위 전체, 필수 Claim 전부. 여기에 2회 시도가
곱해진다.

**아직 조사하지 않았다.** 왜 같은 구조에서 3배 차이가 나는지는 모른다.

---

## 6. 알려진 구멍

- **Preflight 실패에 진단이 안 남는다.** `approvalSourcePreflightDiagnostic` 이
  저장된 문서가 하나도 없다(실측). 어느 Claim 이 왜 막혔는지 알 수 없다.
- **verified Claim 이 만들어지지 않는다.** 내용 대조를 걷어낸 뒤(D-045)
  `normalizedValue` 가 나오는 kind 는 `eligibility` 와 `legal` 뿐이고
  `money` `ratio` `date` `duration` 은 전 기간 0개였다.
- **허용 도메인 목록이 수동이다.** 목록에 없는 공식 기관은 거부된다.
- **발췌를 원고가 안 쓴다.** 저장된 발췌 수치의 미사용분이 12편에 39개 (D-051의
  `evidenceUse` 지표).

---

## 7. 확인 명령

```bash
# 관문이 실제로 불리는 곳
grep -rn "runApprovalSourcePreflight\|guardQualityReviewFactualClaims\|verifyApprovalEvidence" --include=*.ts app core | grep -v core/approval/

# 어떤 도메인이 공식으로 허용되나
grep -n "or.kr\|go.kr" core/approval/ApprovalOfficialSourcePolicy.ts

# 저장된 근거 실측
python3 -c "import json;d=json.load(open('.bright-studio/studio-data.json'));..."
```
