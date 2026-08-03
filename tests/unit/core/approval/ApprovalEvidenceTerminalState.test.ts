import { describe, expect, it } from "vitest";

import {
  verifyApprovalEvidence,
  type ApprovalEvidenceSource,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const definitionUrl = "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031805825";

function source(
  sourceId: string,
  url: string,
  provenance: ApprovalEvidenceSource["provenance"],
  facts: ApprovalEvidenceSource["facts"] = [],
): ApprovalEvidenceSource {
  return {
    sourceId,
    url,
    title: sourceId,
    publisher: "국가법령정보센터",
    sourceType: "official_law",
    retrievedAt: "2026-08-03T00:00:00.000Z",
    verified: false,
    facts,
    provenance,
    selected: provenance !== "search_candidate",
  };
}

function document(sources: readonly ApprovalEvidenceSource[]): ContentDocument {
  return {
    id: "terminal-source-content",
    title: "정기결제와 계속거래 구분",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-03T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-03T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 100,
      approvalEvidence: {
        version: "1.0",
        status: "needs_review",
        sources,
      },
    },
    blocks: [
      {
        id: "definition",
        type: "paragraph",
        text: "방문판매법상 계속거래는 1개월 이상 계속적으로 재화 등을 공급하고 중도 해지할 때 대금 환급 제한 또는 위약금 약정이 있는 거래입니다.",
      },
      {
        id: "date",
        type: "paragraph",
        text: "정보 기준일은 2026년 8월 3일입니다.",
      },
    ],
  };
}

function page(
  requestedUrl: string,
  overrides: Partial<ApprovalSourcePage> = {},
): ApprovalSourcePage {
  return {
    requestedUrl,
    finalUrl: requestedUrl,
    status: 200,
    contentType: "text/html; charset=utf-8",
    title: "국가법령정보센터 | 조문정보",
    publisher: "국가법령정보센터",
    text: "방문판매 등에 관한 법률 제2조의 계속거래는 1개월 이상 계속되는 계약이며 대금 환급 제한 또는 위약금 약정이 있는 거래를 말합니다. ".repeat(8),
    documentFormat: "html",
    extractionStatus: "extracted",
    contentLength: 500,
    ...overrides,
  };
}

describe("Approval Evidence terminal states", () => {
  it("keeps a verified Claim snapshot ready when unrelated future candidates are unsupported, malformed, or unavailable", () => {
    const sources = [
      source("definition", definitionUrl, "system_verified", [
        { field: "continuingTransactionDefinition", value: "방문판매법상 계속거래의 법정 정의" },
      ]),
      source("future-pdf", "https://law.go.kr/future.pdf", "search_candidate"),
      source("future-json", "https://law.go.kr/future.json", "search_candidate"),
      source("future-timeout", "https://law.go.kr/future-timeout", "search_candidate"),
    ];

    const result = verifyApprovalEvidence(
      document(sources),
      "wordpress_life_economy_v1",
      [
        page(definitionUrl),
        page("https://law.go.kr/future.pdf", {
          contentType: "application/pdf",
          text: "",
          documentFormat: "pdf",
          extractionStatus: "unsupported",
          extractionReason: "PDF text layer unavailable",
        }),
        page("https://law.go.kr/future.json", {
          contentType: "application/json",
          text: "",
          documentFormat: "json",
          extractionStatus: "malformed",
          extractionReason: "JSON parse failed",
        }),
        page("https://law.go.kr/future-timeout", {
          status: 0,
          contentType: "",
          text: "",
          documentFormat: "unknown",
          extractionStatus: "unavailable",
          extractionReason: "Timeout",
          fetchError: "Timeout",
        }),
      ],
      "2026-08-03T05:00:00.000Z",
    );

    expect(result.pack).toMatchObject({
      status: "verified",
      coverageStatus: "verified",
      reviewedAt: "2026-08-03T05:00:00.000Z",
      verifiedFactFields: ["continuingTransactionDefinition"],
      unverifiedFactFields: [],
    });
    expect(result.verifiedSourceCount).toBe(1);
    expect(result.rejectedSourceCount).toBe(0);
    expect(result.pack.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "definition", verificationStatus: "verified", verified: true }),
      expect.objectContaining({ sourceId: "future-pdf", verificationStatus: "unsupported_content_type", selected: false }),
      expect.objectContaining({ sourceId: "future-json", verificationStatus: "malformed_content", selected: false }),
      expect.objectContaining({ sourceId: "future-timeout", verificationStatus: "unreachable", selected: false }),
    ]));
  });

  it("classifies a selected source with an unknown Claim role as unsupported_claim instead of throwing or falsely verifying", () => {
    const unknown = source(
      "unknown-claim",
      "https://law.go.kr/new-claim",
      "user_selected",
      [],
    );
    const result = verifyApprovalEvidence(
      document([unknown]),
      "wordpress_life_economy_v1",
      [page(unknown.url)],
      "2026-08-03T05:10:00.000Z",
    );

    expect(result.pack.status).toBe("needs_review");
    expect(result.pack.sources[0]).toMatchObject({
      verificationStatus: "unsupported_claim",
      claimVerificationStatus: "failed",
      verified: false,
    });
  });
});
