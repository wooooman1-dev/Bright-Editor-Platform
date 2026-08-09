import { describe, expect, it } from "vitest";

import { WordPressHtmlRenderer } from "../../../../apps/wordpress/WordPressHtmlRenderer";
import type { ContentDocument } from "../../../../core/content";
import { editorialRevisionId, evaluateHtmlIntegrity } from "../../../../core/quality";

const sourceUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const rawSourceUrl = "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const claim = "계속거래 등에 관한 계약에서는 계약서를 소비자에게 발급해야 하며, 손실을 현저히 초과하는 위약금과 실제 공급분을 초과해 받은 금액의 환급 거부를 제한합니다. (law.go.kr)";

function document(includeProjection: boolean): ContentDocument {
  const editorialBlocks: ContentDocument["blocks"] = [
    { id: "claim", type: "paragraph", text: claim },
    { id: "source", type: "paragraph", text: `정보 기준일은 2026년 8월 1일입니다.\n출처: ${rawSourceUrl}` },
  ];
  return {
    id: "fixed-expense",
    title: "고정지출 줄이는 방법",
    metadata: {
      buttonCount: includeProjection ? 1 : 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 80,
      approvalEvidence: {
        version: "1.0",
        status: "verified",
        coverageStatus: "verified",
        reviewedAt: "2026-08-01T02:00:00.000Z",
        sources: [{
          sourceId: "law-source",
          url: sourceUrl,
          canonicalUrl: sourceUrl,
          title: "방문판매 등에 관한 법률 제30조·제32조",
          publisher: "국가법령정보센터",
          sourceType: "official_law",
          retrievedAt: "2026-08-01T02:00:00.000Z",
          checkedAt: "2026-08-01T02:00:00.000Z",
          verified: true,
          official: true,
          provenance: "citation",
          selected: true,
          cited: true,
          verificationStatus: "verified",
          accessVerificationStatus: "verified",
          officialDomainVerificationStatus: "verified",
          claimVerificationStatus: "verified",
          linkedBlockIds: ["claim", "source"],
          facts: [],
        }],
      },
    },
    blocks: includeProjection
      ? [
          ...editorialBlocks,
          { id: "approval-sources-heading", type: "heading", level: 2, text: "공식 출처와 검토 기준", ownership: "system_source_projection" },
          { id: "approval-source-link-1", type: "button", purpose: "source", label: "방문판매 등에 관한 법률 제30조·제32조 · 국가법령정보센터", targetUrl: sourceUrl, target: "_blank", ownership: "system_source_projection" },
          { id: "approval-review-date", type: "paragraph", text: "출처 확인일: 2026-08-01 · Claim 최종 검토일: 2026-08-01", ownership: "system_source_projection" },
        ]
      : editorialBlocks,
  };
}

describe("WordPress verified Evidence rendering", () => {
  it("projects one structured HTTPS source and suppresses only its verified raw references", () => {
    const value = document(true);
    const html = new WordPressHtmlRenderer().render(value);

    expect(html).toContain('<a class="wp-block-button__link" href="https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&amp;lsJoLnkSeq=1025033501"');
    expect(html).toContain("방문판매 등에 관한 법률 제30조·제32조 · 국가법령정보센터");
    expect(html).toContain("출처 확인일: 2026-08-01");
    expect(html).not.toContain("Claim 최종 검토일");
    expect(value.metadata?.approvalEvidence?.reviewedAt).toBe("2026-08-01T02:00:00.000Z");
    expect(html).not.toContain("(law.go.kr)");
    expect(html).not.toContain(`출처: ${rawSourceUrl}`);
    expect(evaluateHtmlIntegrity(value, html)).toEqual({ passed: true, issues: [] });
  });

  it("does not change the editorial revision when only the system source projection is added", () => {
    expect(editorialRevisionId(document(true))).toBe(editorialRevisionId(document(false)));
  });
});
