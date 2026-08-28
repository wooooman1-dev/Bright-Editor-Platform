import { describe, expect, it } from "vitest";

import { resolveApprovalPolicySnapshot } from "../../../../core/approval";

import {
  createGeneratedClaimVerificationRecord,
  createVerificationSnapshot,
  type VerificationClaimSpec,
  type VerificationSourceAssessment,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
  type ContentDocument,
} from "../../../../core/content";
import { editorialRevisionId, QualityEngine } from "../../../../core/quality";

const claim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-amount",
  field: "amount",
  kind: "money",
  statement: "현재 지원 금액은 50만원이다.",
  rawValue: "50만원",
  qualifiers: Object.freeze({}),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});
const plan = createContentOpportunityVerificationPlan([claim]);
const normalizedValue = Object.freeze({
  kind: "money" as const,
  value: Object.freeze({ amount: 500_000, currency: "KRW", basis: "total" as const }),
});

function assessment(sourceId: string, role: VerificationSourceAssessment["role"]): VerificationSourceAssessment {
  return Object.freeze({
    sourceId,
    institutionGroupId: `institution-${sourceId}`,
    canonicalUrl: `https://${sourceId}.example/claim`,
    role,
    authoritative: true,
    supports: true,
    normalizedValue,
    freshnessStatus: "fresh" as const,
    fresh: true,
    diagnostics: Object.freeze([`claim:${claim.claimId}`]),
  });
}

const assessments = Object.freeze([
  assessment("primary", "primaryOfficial"),
  assessment("official-a", "officialCorroborating"),
  assessment("official-b", "officialCorroborating"),
]);
const snapshot = createVerificationSnapshot({
  plan,
  assessments,
  results: [{
    claimId: claim.claimId,
    normalizedValue,
    sourceAssessments: assessments,
    unresolvedConflict: false,
    freshnessPassed: true,
    diagnostics: [],
  }],
});
const opportunity = confirmContentOpportunity(createContentOpportunityCandidate({
  sourceRequest: "지원 금액 확인 방법을 설명해줘",
  selectionMode: "userSpecified",
  selectedTopic: "지원 금액 확인 방법",
  primaryKeyword: "지원 금액 확인 방법",
  secondaryKeywords: ["공식 지원금 확인"],
  searchIntent: "현재 지원 금액과 공식 확인 경로 파악",
  audience: "공식 지원금 정보를 확인하려는 독자",
  contentType: "article",
  contentAngle: "공식 근거를 기준으로 금액 확인",
  readerProblem: "현재 적용되는 지원 금액을 확인하기 어려움",
  expectedCoverage: ["지원 금액", "공식 확인 경로"],
  selectionRationale: "사용자 지정 주제",
  opportunityEvidence: [{ source: "unknown", summary: "사전 시장 데이터 없음" }],
  confidence: 0.8,
  cautions: [],
  projectId: "project-1",
  verificationPlan: plan,
}), {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  confirmedAt: "2026-08-08T00:00:00.000Z",
});

function baseDocument(text: string): ContentDocument {
  return Object.freeze({
    id: "content-1",
    title: "지원 금액 확인 방법",
    blocks: Object.freeze([
      Object.freeze({ id: "p1", type: "paragraph" as const, text }),
    ]),
    metadata: Object.freeze({
      buttonCount: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-08-08T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 5,
      /**
       * D-045: Generation 구조화 Claim 게이트는 승인 준비 원고에서만 돈다.
       * 일반 Content 는 품질 점수만 본다.
       */
      approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1"),
    }),
  });
}

function verifiedDocument(): ContentDocument {
  const document = baseDocument("현재 지원 금액은 50만원입니다.");
  const generatedClaimVerification = createGeneratedClaimVerificationRecord({
    document,
    plan,
    snapshot,
    boundEditorialRevisionId: editorialRevisionId(document),
  });
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata!,
      generatedClaimVerification,
    }),
  });
}

function review(document: ContentDocument) {
  return new QualityEngine().review(document, {
    opportunity,
    primaryKeyword: opportunity.primaryKeyword,
    searchIntent: opportunity.searchIntent,
    revisionId: editorialRevisionId(document),
  });
}

describe("Generated Claim verification Quality linkage", () => {
  it("does not add a verification block when the current manuscript matches the verified Claim", () => {
    const quality = review(verifiedDocument());

    expect(quality.findings.some((finding) => finding.message.includes("검증되지 않은 고위험 사실"))).toBe(false);
    expect(quality.findings.some((finding) => finding.message.includes("검증 Claim Snapshot"))).toBe(false);
  });

  /**
   * D-045: 이 검사는 출처에서 확인한 값과 본문을 대조하는 장치다. 내용 대조를
   * 하지 않기로 한 이상 기준값이 없으므로 승인을 끄지 않는다. 어떤 값이
   * 어긋났는지는 진단으로 남긴다.
   */
  it("records a changed high-risk value as a diagnostic instead of blocking", () => {
    const current = verifiedDocument();
    const changed = Object.freeze({
      ...current,
      blocks: Object.freeze([
        Object.freeze({ id: "p1", type: "paragraph" as const, text: "현재 지원 금액은 70만원입니다." }),
      ]),
    });
    const quality = review(changed);

    expect(quality.findings.some((finding) =>
      finding.message.includes("70만원")
      && finding.message.includes("가져온 출처 발췌 어디에서도 찾을 수 없는 값"))).toBe(true);
    expect(quality.findings.every((finding) =>
      !finding.message.includes("70만원") || finding.severity === "warning")).toBe(true);
  });

  it("records a missing verification Snapshot as a diagnostic instead of blocking", () => {
    const document = baseDocument("현재 지원 금액은 50만원입니다.");
    const quality = review(document);

    /**
     * D-045 가 보장하는 것은 Claim 게이트가 발행을 막지 않는다는 것뿐이다.
     * 이 원고는 기획 정렬 같은 다른 이유로 여전히 차단될 수 있으므로, 게이트가
     * 만드는 항목만 골라 확인한다.
     */
    expect(quality.tasks.filter((task) =>
      task.message.includes("검증 Claim Snapshot")
      || task.message.includes("검증되지 않은 고위험 사실")
      || task.message.includes("verbatim anchor"),
    ).every((task) => task.status !== "blocked")).toBe(true);
  });
});
