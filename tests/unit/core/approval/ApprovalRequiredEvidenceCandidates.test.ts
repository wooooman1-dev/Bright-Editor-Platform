import { describe, expect, it } from "vitest";

import {
  ensureRequiredApprovalEvidenceCandidates,
  isApprovalEvidenceCandidateSource,
  isApprovalEvidenceSelectedSource,
  verifyApprovalEvidence,
  type ApprovalEvidencePack,
  type ApprovalEvidenceSource,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const definitionUrl = "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031805825";
const interpretationUrl = "https://law.go.kr/expcInfoP.do?expcSeq=314441";

function source(
  sourceId: string,
  url: string,
  overrides: Partial<ApprovalEvidenceSource> = {},
): ApprovalEvidenceSource {
  return {
    sourceId,
    url,
    title: "국가법령정보센터",
    publisher: "국가법령정보센터",
    sourceType: "official_law",
    retrievedAt: "2026-08-03T00:00:00.000Z",
    verified: false,
    facts: [],
    provenance: "search_candidate",
    selected: false,
    ...overrides,
  };
}

function document(sources: readonly ApprovalEvidenceSource[]): ContentDocument {
  const evidence: ApprovalEvidencePack = {
    version: "1.0",
    status: "needs_review",
    sources,
  };
  return {
    id: "content-required-evidence",
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
      wordCount: 80,
      approvalEvidence: evidence,
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

function page(url: string, text: string): ApprovalSourcePage {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    contentType: "text/html; charset=utf-8",
    title: "국가법령정보센터 | 조문정보",
    publisher: "국가법령정보센터",
    text: text.repeat(8),
  };
}

describe("required approval Evidence candidates", () => {
  it("adds the canonical statutory source and demotes a previously auto-selected citation", () => {
    const prepared = ensureRequiredApprovalEvidenceCandidates(
      document([
        source("interpretation", interpretationUrl, {
          provenance: "citation",
          selected: true,
          verified: true,
          verificationStatus: "verified",
          claimVerificationStatus: "verified",
        }),
      ]),
      "wordpress_life_economy_v1",
    );

    const definition = prepared.metadata?.approvalEvidence?.sources.find((item) =>
      item.url === definitionUrl);
    const interpretation = prepared.metadata?.approvalEvidence?.sources.find((item) =>
      item.sourceId === "interpretation");

    expect(definition).toMatchObject({
      provenance: "system_verified",
      selected: true,
      verified: false,
      sourceType: "official_law",
    });
    expect(interpretation).toMatchObject({
      provenance: "search_candidate",
      selected: false,
    });
  });

  it("verifies the direct Article 2 page and leaves the interpretation as an excluded candidate", () => {
    const prepared = ensureRequiredApprovalEvidenceCandidates(
      document([
        source("interpretation", interpretationUrl, {
          provenance: "citation",
          selected: true,
          verified: true,
        }),
      ]),
      "wordpress_life_economy_v1",
    );
    const result = verifyApprovalEvidence(
      prepared,
      "wordpress_life_economy_v1",
      [
        page(definitionUrl, "방문판매 등에 관한 법률 제2조의 계속거래는 1개월 이상 계속되는 계약이며 대금 환급 제한 또는 위약금 약정이 있는 거래를 말합니다. "),
        page(interpretationUrl, "다른 법률과 방문판매법의 적용 관계에 관한 해석례입니다. "),
      ],
      "2026-08-03T03:30:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.unverifiedFactFields).toEqual([]);
    expect(result.pack.sources.filter(isApprovalEvidenceSelectedSource)).toEqual([
      expect.objectContaining({
        url: definitionUrl,
        provenance: "system_verified",
        selected: true,
        verified: true,
      }),
    ]);
    expect(result.pack.sources.filter(isApprovalEvidenceCandidateSource)).toEqual([
      expect.objectContaining({
        sourceId: "interpretation",
        selected: false,
        verificationStatus: "excluded",
      }),
    ]);
  });
});
