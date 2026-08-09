import { describe, expect, it } from "vitest";

import { approvalEvidenceFingerprint } from "../../../../app/application/approval/ApprovalReadinessExecutionIdentity";
import {
  canonicalizeApprovalEvidenceUrl,
  isApprovalEvidenceCandidateSource,
  isApprovalEvidenceSelectedSource,
  verifyApprovalEvidence,
  type ApprovalEvidencePack,
  type ApprovalEvidenceSource,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const definitionUrl = "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031805825";
const unrelatedUrl = "https://law.go.kr/expcInfoP.do?expcSeq=314441";

function source(
  sourceId: string,
  url: string,
  overrides: Partial<ApprovalEvidenceSource> = {},
): ApprovalEvidenceSource {
  return {
    sourceId,
    url,
    title: "국가법령정보센터",
    publisher: "law.go.kr",
    sourceType: "official_law",
    retrievedAt: "2026-08-03T00:00:00.000Z",
    verified: false,
    provenance: "search_candidate",
    selected: false,
    facts: [],
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
    id: "content-evidence-selection",
    title: "계속거래 해지 기준",
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
        id: "claim-definition",
        type: "paragraph",
        text: "방문판매법상 계속거래는 1개월 이상 계속적으로 재화 등을 공급하고 중도 해지할 때 대금 환급 제한 또는 위약금 약정이 있는 거래입니다.",
      },
      {
        id: "information-date",
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

describe("approval Evidence candidate selection", () => {
  it("normalizes law.go.kr host, path case, and display-only query parameters to one source identity", () => {
    const first = canonicalizeApprovalEvidenceUrl(
      "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501&utm_source=test",
    );
    const second = canonicalizeApprovalEvidenceUrl(
      "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501",
    );

    expect(first).toBe(second);
    expect(first).toBe("https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501");
  });

  it("selects only the official candidate needed for required Claim coverage", () => {
    const result = verifyApprovalEvidence(
      document([
        source("definition", definitionUrl),
        source("unrelated", unrelatedUrl),
      ]),
      "wordpress_life_economy_v1",
      [
        page(definitionUrl, "방문판매 등에 관한 법률의 계속거래는 1개월 이상 계속되는 계약이며 환급 제한 또는 위약금 약정이 있는 거래를 말합니다. "),
        page(unrelatedUrl, "다른 법령의 적용 관계에 관한 해석례이며 현재 원고의 계속거래 정의 조문은 포함하지 않습니다. "),
      ],
      "2026-08-03T02:00:00.000Z",
    );

    expect(result.pack.status).toBe("verified");
    expect(result.pack.coverageStatus).toBe("verified");
    expect(result.pack.informationAsOf).toBe("2026-08-03");
    expect(result.verifiedSourceCount).toBe(1);
    expect(result.rejectedSourceCount).toBe(0);

    const selected = result.pack.sources.filter(isApprovalEvidenceSelectedSource);
    const candidates = result.pack.sources.filter(isApprovalEvidenceCandidateSource);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      sourceId: "definition",
      provenance: "system_verified",
      selected: true,
      verified: true,
      claimVerificationStatus: "verified",
    });
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: "unrelated",
        selected: false,
        verificationStatus: "excluded",
      }),
    ]));
  });

  it("does not change readiness execution identity when only an unselected search candidate is added", () => {
    const selected = source("definition", definitionUrl, {
      provenance: "system_verified",
      selected: true,
      verified: true,
      verificationStatus: "verified",
      claimVerificationStatus: "verified",
    });
    const before = approvalEvidenceFingerprint(document([selected]));
    const after = approvalEvidenceFingerprint(document([
      selected,
      source("new-candidate", "https://law.go.kr/lsInfoP.do?lsiSeq=999999"),
    ]));

    expect(after).toBe(before);
  });
});
