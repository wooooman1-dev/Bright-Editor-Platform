import { describe, expect, it } from "vitest";

import {
  evaluateApprovalSourcePreflightCoverage,
  requiredApprovalSourcePreflightClaims,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  type ConfirmedContentOpportunity,
} from "../../../../core/content";

function opportunity(input: Readonly<{
  topic: string;
  keyword: string;
  expectedCoverage: readonly string[];
  projectId?: string;
}>): ConfirmedContentOpportunity {
  const projectId = input.projectId ?? "project-coverage";
  const candidate = createContentOpportunityCandidate({
    sourceRequest: `${input.topic} 글을 작성해줘`,
    selectionMode: "userSpecified",
    selectedTopic: input.topic,
    primaryKeyword: input.keyword,
    secondaryKeywords: [],
    searchIntent: `${input.topic}의 공식 기준과 확인 방법을 찾는 독자 의도`,
    audience: "공식 기준을 확인하려는 독자",
    contentType: "article",
    contentAngle: "공식 출처와 적용 기준 중심",
    readerProblem: "공식 기준과 실제 적용 방법을 판단하기 어려움",
    expectedCoverage: input.expectedCoverage,
    selectionRationale: "사용자가 지정한 정보 탐색 주제",
    opportunityEvidence: [{
      source: "unknown",
      summary: "공식 출처는 Generation 전에 검증해야 함",
    }],
    confidence: 0.8,
    cautions: [],
    projectId,
  });
  return confirmContentOpportunity(candidate, {
    workspaceId: "workspace-coverage",
    projectId,
    contentId: "content-coverage",
    confirmedAt: "2026-08-03T00:00:00.000Z",
  });
}

function page(url: string, text: string): ApprovalSourcePage {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    title: "공식 안내",
    publisher: new URL(url).hostname,
    text: text.repeat(8),
    documentFormat: "html",
    extractionStatus: "extracted",
    contentLength: text.length * 8,
  };
}

describe("Approval Source Preflight Coverage", () => {
  const depositOpportunity = opportunity({
    topic: "예금자보호 한도 확인 방법",
    keyword: "예금자보호 한도 확인 방법",
    expectedCoverage: [
      "보호 대상 금융상품",
      "1억원 보호 한도와 금융회사별 적용 단위",
      "보호 제외 항목",
      "예금보험공사 확인 경로",
      "2025년 9월 1일 시행일과 예금자보호법 근거",
    ],
  });

  it("derives the complete mandatory deposit-protection Claim set from Planning", () => {
    expect(requiredApprovalSourcePreflightClaims(
      depositOpportunity,
      "wordpress_life_economy_v1",
    ).map((claim) => claim.field)).toEqual([
      "depositProtectedProducts",
      "depositProtectionLimit",
      "depositProtectionUnit",
      "depositProtectionExclusions",
      "depositProtectionCheckPath",
      "depositProtectionEffectiveDate",
      "depositProtectionStatutoryBasis",
    ]);
  });

  it("accepts complete verified Claim coverage across official pages", () => {
    const result = evaluateApprovalSourcePreflightCoverage({
      profileId: "wordpress_life_economy_v1",
      opportunity: depositOpportunity,
      sources: [
        {
          page: page(
            "https://www.fsc.go.kr/no010101/84975",
            "예금자보호 대상 금융상품을 안내합니다. 보호 대상이 아닌 보호 제외 상품도 확인할 수 있습니다. 금융회사별 1인 기준으로 원금과 이자를 합한 1억원까지 보호되며 예금보험공사 확인 경로를 제공합니다. ",
          ),
          claims: [
            { field: "depositProtectedProducts", value: "예금자보호 대상 금융상품" },
            { field: "depositProtectionLimit", value: "원금과 이자를 합한 1억원" },
            { field: "depositProtectionUnit", value: "금융회사별 1인" },
            { field: "depositProtectionExclusions", value: "보호 대상이 아닌 보호 제외 상품" },
            { field: "depositProtectionCheckPath", value: "예금보험공사 확인 경로" },
          ],
        },
        {
          page: page(
            "https://law.go.kr/lsInfoP.do?efYd=20250901&lsiSeq=273001&urlMode=lsInfoP",
            "예금자보호법 시행령 [시행 2025. 9. 1.]은 원금과 이자를 합한 1억원의 보호 한도와 금융회사별 1인 적용 단위를 규정합니다. ",
          ),
          claims: [
            { field: "depositProtectionEffectiveDate", value: "2025년 9월 1일" },
            { field: "depositProtectionStatutoryBasis", value: "예금자보호법 시행령" },
          ],
        },
      ],
    });

    expect(result.status).toBe("covered");
    expect(result.uncoveredClaimFields).toEqual([]);
  });

  it("reports missing Claims when only the law page is available", () => {
    const result = evaluateApprovalSourcePreflightCoverage({
      profileId: "wordpress_life_economy_v1",
      opportunity: depositOpportunity,
      sources: [{
        page: page(
          "https://law.go.kr/lsInfoP.do?efYd=20250901&lsiSeq=273001&urlMode=lsInfoP",
          "예금자보호법 시행령 [시행 2025. 9. 1.]은 원금과 이자를 합한 1억원의 보호 한도와 금융회사별 1인 적용 단위를 규정합니다. ",
        ),
        claims: [
          { field: "depositProtectionLimit", value: "원금과 이자를 합한 1억원" },
          { field: "depositProtectionUnit", value: "금융회사별 1인" },
          { field: "depositProtectionEffectiveDate", value: "2025년 9월 1일" },
          { field: "depositProtectionStatutoryBasis", value: "예금자보호법 시행령" },
        ],
      }],
    });

    expect(result.status).toBe("incomplete");
    expect(result.uncoveredClaimFields).toEqual([
      "depositProtectedProducts",
      "depositProtectionExclusions",
      "depositProtectionCheckPath",
    ]);
  });

  it("derives and verifies explicit generic Planning Claims only", () => {
    const genericOpportunity = opportunity({
      topic: "정부 지원 신청 조건 확인",
      keyword: "정부 지원 신청 조건 확인",
      expectedCoverage: ["지원 대상: 소득 기준을 충족하는 가구"],
    });
    const result = evaluateApprovalSourcePreflightCoverage({
      profileId: "wordpress_life_economy_v1",
      opportunity: genericOpportunity,
      sources: [{
        page: page(
          "https://www.gov.kr/portal/service/serviceInfo/test",
          "지원 대상은 소득 기준을 충족하는 가구입니다. 신청 전 최신 공고를 확인해야 합니다. ",
        ),
        claims: [
          { field: "eligibility", value: "지원 대상은 소득 기준을 충족하는 가구" },
          { field: "incomeThreshold", value: "소득 기준을 충족하는 가구" },
        ],
      }],
    });

    expect(result.requiredClaims.map((claim) => claim.field)).toEqual([
      "eligibility",
      "incomeThreshold",
    ]);
    expect(result.status).toBe("covered");
  });

  it("requires the art profile metadata roles before Generation", () => {
    const artOpportunity = opportunity({
      topic: "진주 귀걸이를 한 소녀 감상법",
      keyword: "진주 귀걸이를 한 소녀 감상법",
      expectedCoverage: ["작품 정보", "관찰 순서"],
      projectId: "project-art",
    });

    expect(requiredApprovalSourcePreflightClaims(
      artOpportunity,
      "tistory_vivarain_art_v1",
    ).map((claim) => claim.field)).toEqual([
      "artworkTitle",
      "creationYear",
      "medium",
      "dimensions",
      "holdingInstitution",
    ]);
  });
});
