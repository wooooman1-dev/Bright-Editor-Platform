import { describe, expect, it } from "vitest";

import {
  evaluateApprovalSourcePreflightCoverage,
  requiredApprovalSourcePreflightClaims,
  type ApprovalSourcePage,
  type ApprovalSourcePreflightClaim,
  type ApprovalSourcePreflightRequirement,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ConfirmedContentOpportunity,
} from "../../../../core/content";

function opportunity(input: Readonly<{
  topic?: string;
  expectedCoverage?: readonly string[];
  searchIntent?: string;
  readerProblem?: string;
  projectId?: string;
}> = {}): ConfirmedContentOpportunity {
  const topic = input.topic ?? "새 지원정책 신청 기준";
  const projectId = input.projectId ?? "project-universal-source";
  const candidate = createContentOpportunityCandidate({
    sourceRequest: `${topic} 글을 작성해줘`,
    selectionMode: "userSpecified",
    selectedTopic: topic,
    primaryKeyword: topic,
    secondaryKeywords: [],
    searchIntent: input.searchIntent ?? "공식 지원 대상과 지원 금액 확인",
    audience: "공식 기준을 확인하려는 독자",
    contentType: "article",
    contentAngle: "공식 원문과 실제 적용값 중심",
    readerProblem: input.readerProblem ?? "신청 대상과 금액을 판단하기 어려움",
    expectedCoverage: input.expectedCoverage ?? [
      "지원 대상: 만 19세 이상 거주자",
      "지원 금액: 100만원",
    ],
    selectionRationale: "사용자 지정 주제",
    opportunityEvidence: [{
      source: "unknown",
      summary: "Generation 전에 공식 출처 검증 필요",
    }],
    confidence: 0.8,
    cautions: [],
    projectId,
  });
  return confirmContentOpportunity(candidate, {
    workspaceId: "workspace-universal-source",
    projectId,
    contentId: "content-universal-source",
    confirmedAt: "2026-08-03T00:00:00.000Z",
  });
}

function page(input: Readonly<{
  requestedUrl?: string;
  finalUrl?: string;
  text: string;
  status?: number;
  documentFormat?: ApprovalSourcePage["documentFormat"];
  extractionStatus?: ApprovalSourcePage["extractionStatus"];
}>): ApprovalSourcePage {
  const requestedUrl = input.requestedUrl
    ?? "https://policy-new.city.go.kr/not-mapped";
  const finalUrl = input.finalUrl ?? requestedUrl;
  return Object.freeze({
    requestedUrl,
    finalUrl,
    status: input.status ?? 200,
    contentType: "text/html; charset=utf-8",
    title: "새 공식 정책 안내",
    publisher: new URL(finalUrl).hostname,
    text: input.text.repeat(6),
    documentFormat: input.documentFormat ?? "html",
    extractionStatus: input.extractionStatus ?? "extracted",
    contentLength: input.text.length * 6,
  });
}

function claim(
  field: string,
  value: string,
  evidenceExcerpt = value,
): ApprovalSourcePreflightClaim {
  return Object.freeze({ field, value, evidenceExcerpt });
}

function evaluate(input: Readonly<{
  requiredClaims: readonly ApprovalSourcePreflightRequirement[];
  sources: readonly Readonly<{
    page: ApprovalSourcePage;
    claims: readonly ApprovalSourcePreflightClaim[];
  }>[];
}>) {
  return evaluateApprovalSourcePreflightCoverage({
    profileId: "wordpress_life_economy_v1",
    opportunity: opportunity(),
    requiredClaims: input.requiredClaims,
    sources: input.sources,
  });
}

describe("Approval Source Preflight universal Claim coverage", () => {
  it("passes an unseen official URL without URL-role mapping when the Claim is real", () => {
    const result = evaluate({
      requiredClaims: [{ field: "amount", plannedValue: "지원 금액 100만원" }],
      sources: [{
        page: page({
          text: "지원 금액은 가구당 100만원이며 공식 누리집에서 확인합니다.",
        }),
        claims: [claim(
          "amount",
          "100만원",
          "지원 금액은 가구당 100만원",
        )],
      }],
    });

    expect(result.status).toBe("covered");
    expect(result.coveredClaimFields).toEqual(["amount"]);
    expect(result.sources[0]?.hintedClaimFields).toEqual([]);
  });

  it("blocks a value that does not exist on the fetched page", () => {
    const result = evaluate({
      requiredClaims: [{ field: "amount" }],
      sources: [{
        page: page({ text: "지원 금액은 가구당 100만원입니다." }),
        claims: [claim(
          "amount",
          "200만원",
          "지원 금액은 가구당 100만원",
        )],
      }],
    });

    expect(result.status).toBe("incomplete");
    expect(result.uncoveredClaimFields).toEqual(["amount"]);
  });

  it("blocks a fabricated Claim excerpt", () => {
    const result = evaluate({
      requiredClaims: [{ field: "amount" }],
      sources: [{
        page: page({ text: "지원 금액은 가구당 100만원입니다." }),
        claims: [claim(
          "amount",
          "100만원",
          "지원 금액은 가구당 200만원",
        )],
      }],
    });

    expect(result.status).toBe("incomplete");
  });

  it("blocks a Claim with a missing field, value, or evidence excerpt", () => {
    const requiredClaims = [{ field: "amount" }];
    const invalidClaims: ApprovalSourcePreflightClaim[] = [
      { field: "", value: "100만원", evidenceExcerpt: "지원 금액은 100만원" },
      { field: "amount", value: "", evidenceExcerpt: "지원 금액은 100만원" },
      { field: "amount", value: "100만원", evidenceExcerpt: "" },
    ];

    for (const invalidClaim of invalidClaims) {
      const result = evaluate({
        requiredClaims,
        sources: [{
          page: page({ text: "지원 금액은 100만원입니다." }),
          claims: [invalidClaim],
        }],
      });
      expect(result.status).toBe("incomplete");
    }
  });

  it("records the redirect final URL and verifies the final page body", () => {
    const result = evaluate({
      requiredClaims: [{ field: "eligibility" }],
      sources: [{
        page: page({
          requestedUrl: "https://policy-new.city.go.kr/old",
          finalUrl: "https://policy-new.city.go.kr/current",
          text: "지원 대상은 기준 중위소득 80% 이하 가구입니다.",
        }),
        claims: [claim(
          "eligibility",
          "기준 중위소득 80% 이하 가구",
          "지원 대상은 기준 중위소득 80% 이하 가구",
        )],
      }],
    });

    expect(result.status).toBe("covered");
    expect(result.sources[0]?.url).toBe(
      "https://policy-new.city.go.kr/current",
    );
  });

  it("combines multiple unseen official pages to complete Coverage", () => {
    const result = evaluate({
      requiredClaims: [
        { field: "eligibility" },
        { field: "amount" },
      ],
      sources: [
        {
          page: page({
            requestedUrl: "https://first.city.go.kr/new-a",
            text: "지원 대상은 만 19세 이상 거주자입니다.",
          }),
          claims: [claim(
            "eligibility",
            "만 19세 이상 거주자",
            "지원 대상은 만 19세 이상 거주자",
          )],
        },
        {
          page: page({
            requestedUrl: "https://second.city.go.kr/new-b",
            text: "지원 금액은 100만원입니다.",
          }),
          claims: [claim(
            "amount",
            "100만원",
            "지원 금액은 100만원",
          )],
        },
      ],
    });

    expect(result.status).toBe("covered");
    expect(result.coveredClaimFields).toEqual(["eligibility", "amount"]);
  });

  it("blocks partial Coverage", () => {
    const result = evaluate({
      requiredClaims: [
        { field: "eligibility" },
        { field: "amount" },
      ],
      sources: [{
        page: page({ text: "지원 대상은 만 19세 이상 거주자입니다." }),
        claims: [claim(
          "eligibility",
          "만 19세 이상 거주자",
          "지원 대상은 만 19세 이상 거주자",
        )],
      }],
    });

    expect(result.status).toBe("incomplete");
    expect(result.uncoveredClaimFields).toEqual(["amount"]);
  });

  it("normalizes the same exact date across official formats", () => {
    const result = evaluate({
      requiredClaims: [{
        field: "depositProtectionEffectiveDate",
        plannedValue: "2025년 9월 1일",
      }],
      sources: [{
        page: page({ text: "이 규정은 [시행 2025. 9. 1.]부터 적용합니다." }),
        claims: [claim(
          "depositProtectionEffectiveDate",
          "2025년 9월 1일",
          "이 규정은 [시행 2025. 9. 1.]부터 적용합니다",
        )],
      }],
    });

    expect(result.status).toBe("covered");
  });

  it("accepts the exact date from a compact URL query", () => {
    const result = evaluate({
      requiredClaims: [{
        field: "depositProtectionEffectiveDate",
        plannedValue: "2025년 9월 1일",
      }],
      sources: [{
        page: page({
          requestedUrl: "https://law.go.kr/page?efYd=20250901",
          finalUrl: "https://law.go.kr/page?efYd=20250901",
          text: "예금자보호법 시행일 안내입니다.",
        }),
        claims: [claim(
          "depositProtectionEffectiveDate",
          "2025년 9월 1일",
          "예금자보호법 시행일 안내입니다",
        )],
      }],
    });

    expect(result.status).toBe("covered");
  });

  it("blocks a similar but different date", () => {
    const result = evaluate({
      requiredClaims: [{
        field: "depositProtectionEffectiveDate",
        plannedValue: "2025년 9월 1일",
      }],
      sources: [{
        page: page({ text: "이 규정은 [시행 2025. 8. 31.]부터 적용합니다." }),
        claims: [claim(
          "depositProtectionEffectiveDate",
          "2025년 9월 1일",
          "이 규정은 [시행 2025. 8. 31.]부터 적용합니다",
        )],
      }],
    });

    expect(result.status).toBe("incomplete");
  });

  it("trusts the quoted legal provision without a second planned-number comparison", () => {
    const result = evaluate({
      requiredClaims: [{
        field: "legalPeriod",
        plannedValue: "6 months before expiry",
      }],
      sources: [{
        page: page({
          requestedUrl: "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1021710303",
          text: "The official provision states that the request may be made within the statutory period.",
        }),
        claims: [claim(
          "legalPeriod",
          "the request may be made within the statutory period",
          "The official provision states that the request may be made within the statutory period.",
        )],
      }],
    });

    expect(result.status).toBe("covered");
  });

  it("normalizes equivalent Korean-won amounts and rejects another amount", () => {
    const accepted = evaluate({
      requiredClaims: [{ field: "amount", plannedValue: "1억원" }],
      sources: [{
        page: page({ text: "최대 지원 한도는 100,000,000원입니다." }),
        claims: [claim(
          "amount",
          "1억원",
          "최대 지원 한도는 100,000,000원입니다",
        )],
      }],
    });
    expect(accepted.status).toBe("covered");

    const rejected = evaluate({
      requiredClaims: [{ field: "amount", plannedValue: "1억원" }],
      sources: [{
        page: page({ text: "최대 지원 한도는 90,000,000원입니다." }),
        claims: [claim(
          "amount",
          "1억원",
          "최대 지원 한도는 90,000,000원입니다",
        )],
      }],
    });
    expect(rejected.status).toBe("incomplete");
  });

  it("keeps art metadata as mandatory Planning Claims", () => {
    expect(requiredApprovalSourcePreflightClaims(
      opportunity({
        topic: "처음 보는 미술 작품 해설",
        expectedCoverage: ["작품 정보", "관찰 순서"],
        searchIntent: "공식 작품 정보와 감상 순서 확인",
        readerProblem: "작품 정보를 정확히 확인하기 어려움",
        projectId: "project-art-universal",
      }),
      "tistory_vivarain_art_v1",
    ).map((item) => item.field)).toEqual([
      "artworkTitle",
      "creationYear",
      "medium",
      "dimensions",
      "holdingInstitution",
    ]);
  });

  it("does not invent eligibility or statutoryBasis when Planning has neither", () => {
    const claims = requiredApprovalSourcePreflightClaims(
      opportunity({
        topic: "가계부 항목 정리 방법",
        expectedCoverage: ["항목 분류", "정리 순서"],
        searchIntent: "가계부를 효율적으로 정리하는 방법",
        readerProblem: "지출 항목을 분류하기 어려움",
        projectId: "project-no-fallback",
      }),
      "wordpress_life_economy_v1",
    );

    expect(claims.map((item) => item.field)).not.toContain("eligibility");
    expect(claims.map((item) => item.field)).not.toContain("statutoryBasis");
  });

  it("uses claimId identity when multiple required Claims share one field", () => {
    const result = evaluate({
      requiredClaims: [
        { claimId: "claim-a", field: "amount", statement: "첫 번째 금액", plannedValue: "100만원" },
        { claimId: "claim-b", field: "amount", statement: "두 번째 금액", plannedValue: "200만원" },
      ],
      sources: [{
        page: page({ text: "첫 번째 금액은 100만원이고 두 번째 금액은 200만원입니다." }),
        claims: [
          { claimId: "claim-a", field: "amount", value: "100만원", evidenceExcerpt: "첫 번째 금액은 100만원" },
          { claimId: "claim-b", field: "amount", value: "200만원", evidenceExcerpt: "두 번째 금액은 200만원" },
        ],
      }],
    });

    expect(result.status).toBe("covered");
    expect(result.coveredClaimIds).toEqual(["claim-a", "claim-b"]);
    expect(result.uncoveredClaimIds).toEqual([]);
  });

  it("does not let one Claim cover another Claim with the same field", () => {
    const result = evaluate({
      requiredClaims: [
        { claimId: "claim-a", field: "amount", plannedValue: "100만원" },
        { claimId: "claim-b", field: "amount", plannedValue: "200만원" },
      ],
      sources: [{
        page: page({ text: "첫 번째 금액은 100만원입니다." }),
        claims: [{ claimId: "claim-a", field: "amount", value: "100만원", evidenceExcerpt: "첫 번째 금액은 100만원" }],
      }],
    });

    expect(result.status).toBe("incomplete");
    expect(result.uncoveredClaimIds).toEqual(["claim-b"]);
  });
});
