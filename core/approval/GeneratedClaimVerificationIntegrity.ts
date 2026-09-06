import type { ContentDocument } from "../content/ContentDocument";
import {
  bindGeneratedClaims,
  type GeneratedClaimBinding,
  type GeneratedClaimLocation,
} from "./GeneratedClaimBinding";
import {
  approvalEvidenceContainsScalar,
  approvalEvidenceScalarHaystack,
} from "./ApprovalEvidenceScalarPresence";
import { evaluateStoredGeneratedFactualClaims } from "./GeneratedFactualClaim";
import { generatedFactualInventoryIntegrityReason } from "./GeneratedFactualClaimInventory";
import { isCriticalVerificationClaim } from "./VerificationClaim";
import {
  evaluateVerificationGenerationGate,
  type VerificationGenerationPlan,
} from "./VerificationGenerationGate";

export type GeneratedClaimVerificationIntegrityResult = Readonly<{
  passed: boolean;
  reasons: readonly string[];
  /** 발행을 막지는 않지만 사용자가 알아야 하는 변화. 이유를 문장에 담는다. */
  warnings: readonly string[];
  bindings: readonly GeneratedClaimBinding[];
  verifiedClaimIds: readonly string[];
  unverifiedDetectedCount: number;
}>;

/**
 * Platform-neutral integrity check shared by Quality and Publishing.
 *
 * The persisted server record is evidence, not authority by itself. Every call
 * re-evaluates the Verification Generation Gate and deterministically rebinds
 * the current canonical manuscript against the persisted VerificationSnapshot.
 * This adds no AI or network call.
 */
export function evaluateGeneratedClaimVerificationIntegrity(input: Readonly<{
  document: ContentDocument;
  plan?: VerificationGenerationPlan;
  currentRevisionId?: string;
}>): GeneratedClaimVerificationIntegrityResult {
  const inventoryReason = generatedFactualInventoryIntegrityReason(input.document);
  if (inventoryReason) return failedResult([inventoryReason]);
  if (!input.plan?.claims.some(isCriticalVerificationClaim)) return passedResult();

  const stored = input.document.metadata?.generatedClaimVerification;
  if (!stored) {
    return failedResult([
      "검증 Claim Snapshot이 현재 canonical 원고에 저장되어 있지 않습니다.",
    ]);
  }

  const gate = evaluateVerificationGenerationGate({
    plan: input.plan,
    snapshot: stored.verificationSnapshot,
  });
  if (!gate.ready) {
    const detail = [
      ...gate.diagnostics,
      ...gate.blockingClaimIds.map((claimId) => `claim:${claimId}`),
    ].join(", ");
    return failedResult([
      `저장된 검증 Snapshot이 현재 Generation Gate를 통과하지 못합니다${detail ? `: ${detail}` : ""}.`,
    ]);
  }

  const rebound = bindGeneratedClaims({
    document: input.document,
    plan: input.plan,
    snapshot: stored.verificationSnapshot,
    gate,
  });
  /**
   * 값이 바뀐 것은 막지 않고 알린다 (D-045).
   *
   * 이 판정은 "원고의 수치가 검증된 Claim 값과 일치하는가"였다. 값 일치를 만들던
   * 내용 대조를 걷어낸 이상 어떤 수치도 검증된 값으로 표시될 수 없고, 그래서 차단
   * 조건으로 두면 통과할 수 없는 관문이 된다. 2026-08-19 밝은재테크 실측: 출처를
   * 명시한 "전입한 날부터 14일 이내" 문장이 여기에 걸려 정상 원고의 발행을 막았다.
   *
   * 그래도 사용자는 무엇이 바뀌었는지 알아야 하므로, 어떤 값이 어디에서 걸렸는지를
   * 문장에 담아 경고로 남긴다. 생성된 수치가 검토 단계에서 바뀌는 것은
   * QualityReviewFactualGuard 가 계속 막는다.
   */
  const reasons: string[] = [];
  /**
   * 가져온 발췌에 그대로 있는 값은 경고하지 않는다.
   *
   * 미연결 수치의 허용 목록은 verified Claim 에서만 만들어지는데 내용 대조를
   * 걷어낸 뒤로 verified 가 되는 Claim 이 없어, 허용 목록이 늘 비어 본문의 모든
   * 수치가 경고가 됐다. 2026-08-28 실측: 근로장려금 원고 경고 19개가 전부 국세청
   * 발췌에 있는 값이었고 그중 넷은 `’26.5.1.` 을 원고가 `2026년 5월 1일` 로 풀어
   * 쓴 것뿐이었다. 전체 원고의 개선 작업 112개 중 23개가 이 오탐이었다.
   *
   * 발췌가 없으면 걸러내지 않는다. 그때는 비교할 근거가 없으므로 전과 같이 남긴다.
   */
  const evidenceHaystack = approvalEvidenceScalarHaystack(input.document);
  const warnings = rebound.bindings
    .filter((binding) => binding.reference.referenceType === "unverifiedDetected")
    .filter((binding) => !approvalEvidenceContainsScalar(evidenceHaystack, binding.matchedText))
    .map((binding) =>
      `가져온 출처 발췌 어디에서도 찾을 수 없는 값이 원고에 있습니다: "${binding.matchedText}" (${bindingLocation(binding.location)}). 발행은 막지 않으니 출처에 있는 값인지 확인하세요.`);

  const semanticWarnings: string[] = [];
  if (stored.semanticContractVersion === 1) {
    if (!stored.semanticClaims) {
      reasons.push("구조화 Generated Claim semantic contract가 canonical metadata에서 누락되었습니다.");
    } else {
      const semantic = evaluateStoredGeneratedFactualClaims({
        document: input.document,
        plan: input.plan,
        snapshot: stored.verificationSnapshot,
        gate,
        claims: stored.semanticClaims,
      });
      reasons.push(...semantic.reasons);
      semanticWarnings.push(...semantic.warnings);
    }
  }

  /**
   * 저장된 binding 과 재계산 결과의 불일치는 더 이상 차단 사유가 아니다 (D-045).
   *
   * binding 은 Snapshot 에서 파생되는 값이고, 이 모듈은 매 호출마다 그것을 다시
   * 계산한다. 재계산이 곧 권위이므로 파생값을 서로 비교해 얻는 것이 없다. 반대로
   * 판정 규칙이 바뀌면 이미 저장된 원고는 전부 불일치가 되어, 정책 변경 자체가
   * 기존 원고를 발행 불가로 만든다. Snapshot 자체의 위조는 Gate 의 지문 검사가
   * 계속 잡는다.
   */

  return Object.freeze({
    passed: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    warnings: Object.freeze([...new Set([...warnings, ...semanticWarnings])]),
    bindings: rebound.bindings,
    verifiedClaimIds: rebound.verifiedClaimIds,
    unverifiedDetectedCount: rebound.unverifiedDetectedCount,
  });
}

export function assertGeneratedClaimVerificationIntegrity(input: Readonly<{
  document: ContentDocument;
  plan?: VerificationGenerationPlan;
  currentRevisionId?: string;
}>): void {
  const result = evaluateGeneratedClaimVerificationIntegrity(input);
  if (result.passed) return;
  throw new Error(
    `Publishing blocked: generated Claim verification failed. ${result.reasons.join(" ")}`,
  );
}

function bindingLocation(location: GeneratedClaimLocation): string {
  if (location.kind === "title") return "제목";
  if (location.kind === "metadata") return `metadata.${location.field}`;
  return `block:${location.blockId}`;
}

function passedResult(): GeneratedClaimVerificationIntegrityResult {
  return Object.freeze({
    passed: true,
    reasons: Object.freeze([]),
    warnings: Object.freeze([]),
    bindings: Object.freeze([]),
    verifiedClaimIds: Object.freeze([]),
    unverifiedDetectedCount: 0,
  });
}

function failedResult(
  reasons: readonly string[],
): GeneratedClaimVerificationIntegrityResult {
  return Object.freeze({
    passed: false,
    reasons: Object.freeze([...new Set(reasons)]),
    warnings: Object.freeze([]),
    bindings: Object.freeze([]),
    verifiedClaimIds: Object.freeze([]),
    unverifiedDetectedCount: 0,
  });
}

