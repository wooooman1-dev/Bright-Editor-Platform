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
  return contentDocument(sources, [
    {
      id: "definition",
      type: "paragraph",
      text: "방문판매법상 계속거래는 1개월 이상 계속적으로 재화 등을 공급하고 중도 해지할 때 대금 환급 제한 또는 위약금 약정이 있는 거래입니다.",
    },
  ]);
}

function contentDocument(
  sources: readonly ApprovalEvidenceSource[],
  blocks: ContentDocument["blocks"],
): ContentDocument {
  return {
    id: "terminal-source-content",
    title: "공식 근거 검증",
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
      ...blocks,
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

  it("creates and verifies a deterministic generic Claim role for a previously unknown legal assertion", () => {
    const url = "https://law.go.kr/new-privacy-claim";
    const claim = "개인정보보호법 제28조의2에 따라 가명정보는 통계작성, 과학적 연구, 공익적 기록보존을 위하여 정보주체 동의 없이 처리할 수 있습니다.";
    const result = verifyApprovalEvidence(
      contentDocument(
        [source("new-privacy-law", url, "search_candidate")],
        [{ id: "new-claim", type: "paragraph", text: claim }],
      ),
      "wordpress_life_economy_v1",
      [page(url, { text: `${claim} 관련 적용 범위와 제한 사항을 규정합니다. `.repeat(8) })],
      "2026-08-03T05:05:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.requiredFactFields).toHaveLength(1);
    expect(result.pack.requiredFactFields?.[0]).toMatch(/^genericClaim:/u);
    expect(result.pack.verifiedFactFields).toEqual(result.pack.requiredFactFields);
    expect(result.pack.sources[0]).toMatchObject({
      sourceId: "new-privacy-law",
      provenance: "system_verified",
      selected: true,
      verified: true,
      verificationStatus: "verified",
    });
  });

  /**
   * D-045: 연결할 Claim 역할을 못 찾아도 거부하지 않는다. 신뢰할 수 있는 곳에서
   * 열린 페이지라는 사실이 근거이고, 역할 식별 실패로 원고를 막지 않는다.
   */
  it("accepts a reachable official page even when no Claim role is identified", () => {
    const unknown = source(
      "unknown-claim",
      "https://law.go.kr/new-claim",
      "user_selected",
      [],
    );
    const result = verifyApprovalEvidence(
      contentDocument(
        [unknown],
        [{ id: "neutral", type: "paragraph", text: "이 문서는 일상적인 정리 방법을 설명합니다." }],
      ),
      "wordpress_life_economy_v1",
      [page(unknown.url, { text: "공식 페이지의 일반적인 안내 내용입니다. ".repeat(20) })],
      "2026-08-03T05:10:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.sources[0]).toMatchObject({
      verificationStatus: "verified",
      verified: true,
    });
  });
});
