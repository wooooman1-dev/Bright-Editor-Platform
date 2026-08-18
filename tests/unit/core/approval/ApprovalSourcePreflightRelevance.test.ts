import { describe, expect, it } from "vitest";

import { evaluateApprovalSourceRelevance } from "../../../../core/approval";
import { createContentOpportunityCandidate } from "../../../../core/content";

const opportunity = createContentOpportunityCandidate({
  sourceRequest: "savings early termination guidance",
  selectionMode: "userSpecified",
  selectedTopic: "Savings early termination decision criteria",
  primaryKeyword: "savings early termination",
  secondaryKeywords: ["interest loss", "alternative options"],
  searchIntent: "check savings early termination costs",
  audience: "general readers",
  contentType: "guide",
  contentAngle: "official savings guidance",
  readerProblem: "uncertain about early termination consequences",
  expectedCoverage: ["early termination interest", "product terms"],
  selectionRationale: "synthetic fixture",
  opportunityEvidence: [{ source: "unknown", summary: "synthetic" }],
  confidence: 1,
  cautions: [],
  projectId: "project-synthetic",
});

function page(title: string, text: string) {
  return {
    requestedUrl: "https://official.example/source",
    finalUrl: "https://official.example/source",
    status: 200,
    contentType: "text/html",
    title,
    publisher: "Official Institution",
    text,
    extractionStatus: "extracted" as const,
  };
}

const koreanOpportunity = createContentOpportunityCandidate({
  sourceRequest: "휴면예금 조회 방법 글을 작성해줘",
  selectionMode: "userSpecified",
  selectedTopic: "휴면예금 조회 방법: 잊은 예금과 계좌를 찾은 뒤 청구까지 잇는 절차",
  primaryKeyword: "휴면예금 조회 방법",
  secondaryKeywords: ["휴면예금 찾기", "휴면계좌 조회", "dormant deposit"],
  searchIntent: "휴면예금을 공식 서비스에서 조회하는 방법",
  audience: "일반 독자",
  contentType: "guide",
  contentAngle: "공식 조회 경로",
  readerProblem: "어디서 조회하는지 모른다",
  expectedCoverage: ["신청 조건", "공식 재확인 경로"],
  selectionRationale: "synthetic fixture",
  opportunityEvidence: [{ source: "unknown", summary: "synthetic" }],
  confidence: 1,
  cautions: [],
  projectId: "project-synthetic",
});

describe("Approval source relevance subject rule", () => {
  it("rejects a Korean portal shell that shares only generic scope words", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity: koreanOpportunity,
      page: page(
        "나의 생활정보 | 정부24",
        "정부24 홈 비회원 MyGOV 서비스 신청내역 내 지갑 환불정보 조회 서비스 바구니 민원서비스 민원 찾기 주제별 보기 혜택알리미 생활가이드 정책정보",
      ),
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnosticCode).toBe("source_topic_relevance_unverified");
  });

  it("accepts a Korean page that actually names the subject", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity: koreanOpportunity,
      page: page(
        "휴면예금 조회 안내",
        "휴면예금 조회는 공식 서비스에서 본인 확인을 거쳐 진행하며, 조회 결과에 따라 지급 청구 절차가 이어집니다.",
      ),
    });
    expect(result.status).toBe("passed");
  });

  it("does not require a Korean subject term in a source written in another language", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity: koreanOpportunity,
      page: page(
        "Dormant deposit lookup",
        "Dormant deposit lookup is operated as an official service and requires identity verification before a payout claim is filed.",
      ),
    });
    expect(result.status).toBe("passed");
  });
});

describe("Approval source relevance", () => {
  it("rejects an official page whose subject is unrelated to the selected topic", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Public election asset disclosure", "Election candidate asset disclosure filing guidance."),
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnosticCode).toBe("source_topic_relevance_unverified");
  });

  it("accepts a page with deterministic topic-scope signals", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Savings early termination guidance", "Savings early termination interest loss and product terms."),
    });
    expect(result.status).toBe("passed");
    expect(result.matchedSignals).toEqual(expect.arrayContaining(["topic:savings", "topic:early"]));
  });

  it("accepts a Claim-relevant official page when the page uses the Claim vocabulary", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Savings interest income tax withholding", "Official guidance on savings interest income tax withholding."),
      additionalScope: [
        "savings interest income tax",
        "interest income tax withholding",
      ],
    });
    expect(result.status).toBe("passed");
    expect(result.matchedSignals).toEqual(expect.arrayContaining(["claim:savings", "claim:interest"]));
  });

  it("rejects an official page when neither topic nor its claimed facts are supported", () => {
    const result = evaluateApprovalSourceRelevance({
      profileId: "wordpress_life_economy_v1",
      opportunity,
      page: page("Public election asset disclosure", "Election candidate asset disclosure filing guidance."),
      additionalScope: ["savings interest income tax", "interest income tax withholding"],
    });
    expect(result.status).toBe("rejected");
    expect(result.diagnosticCode).toBe("source_topic_relevance_unverified");
  });
});
