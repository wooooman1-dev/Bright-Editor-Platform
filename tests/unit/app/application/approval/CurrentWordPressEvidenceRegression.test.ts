import { describe, expect, it, vi } from "vitest";

import { normalizeApprovalEvidenceCandidates } from "../../../../../app/application/approval/ApprovalEvidenceCandidateNormalization";
import { ApprovalReadinessApplicationService } from "../../../../../app/application/approval/ApprovalReadinessApplicationService";
import type { UserData } from "../../../../../app/user-flow/user-data";
import { WordPressHtmlRenderer } from "../../../../../apps/wordpress/WordPressHtmlRenderer";
import { resolveApprovalPolicySnapshot } from "../../../../../core/approval";
import type { ContentDocument } from "../../../../../core/content";
import { editorialRevisionId, evaluateHtmlIntegrity, type ApprovalAwareQualityReport, type QualityReport } from "../../../../../core/quality";

const canonicalUrl = "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const documentUrl = "https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1025033501";
const claimText = "계속거래 등에 관한 계약에서는 사업자가 계약 내용을 적은 계약서를 소비자에게 발급해야 하며, 해지·해제로 생기는 손실을 현저히 초과하는 위약금을 청구하거나 실제 공급분을 초과해 받은 대금의 환급을 부당하게 거부해서는 안 된다는 기준이 규정되어 있습니다. (law.go.kr)";

function standardQuality(document: ContentDocument): QualityReport {
  return {
    approved: true,
    approvalType: "standard",
    approvalState: "approved",
    findings: [],
    overallScore: 100,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt: "2026-08-01T00:00:00.000Z",
    reviewedRevisionId: editorialRevisionId(document),
    weights: {} as QualityReport["weights"],
  };
}

function fixture(): UserData {
  const document: ContentDocument = {
    id: "content-fixed-expense",
    title: "고정지출 줄이는 방법: 해지 전 계약 조건과 사용 빈도를 점검하는 순서",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-01T00:00:00.000Z",
      generator: "test",
      imageCount: 1,
      language: "ko",
      readingTime: 4,
      source: "test",
      updatedAt: "2026-08-01T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 900,
      approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1"),
      approvalEvidence: {
        version: "1.0",
        status: "needs_review",
        sources: [
          {
            sourceId: "search-related",
            url: `${canonicalUrl}&utm_source=openai`,
            title: "검색 후보",
            publisher: "law.go.kr",
            sourceType: "official_institution",
            retrievedAt: "2026-08-01T00:00:00.000Z",
            verified: false,
            provenance: "search_candidate",
            facts: [],
          },
          {
            sourceId: "citation",
            url: `${canonicalUrl}&utm_source=openai`,
            title: "국가법령정보센터 | 조문정보",
            publisher: "law.go.kr",
            sourceType: "official_law",
            retrievedAt: "2026-08-01T00:00:00.000Z",
            verified: false,
            provenance: "citation",
            cited: true,
            selected: true,
            citationExcerpt: `([law.go.kr](${canonicalUrl}&utm_source=openai))`,
            facts: [],
          },
          {
            sourceId: "document-link",
            url: documentUrl,
            title: "www.law.go.kr",
            publisher: "www.law.go.kr",
            sourceType: "official_law",
            retrievedAt: "2026-08-01T00:00:00.000Z",
            verified: false,
            provenance: "document_link",
            citationExcerpt: `출처: ${documentUrl}`,
            linkedBlockIds: ["source"],
            facts: [{ field: "citedContext", value: `출처: ${documentUrl}` }],
          },
          {
            sourceId: "search-unrelated",
            url: "https://www.law.go.kr/LSW/lsRvsDocListP.do?lsId=000355",
            title: "관련 없는 개정 이력",
            publisher: "law.go.kr",
            sourceType: "official_law",
            retrievedAt: "2026-08-01T00:00:00.000Z",
            verified: false,
            provenance: "search_candidate",
            facts: [],
          },
        ],
      },
      approvalDuplicateCheck: { version: "1.0", status: "passed", checkedAt: "2026-08-01T00:00:00.000Z", comparedContentIds: [], reasons: [] },
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
    },
    blocks: [
      { id: "intro", type: "paragraph", text: "고정지출 줄이는 방법의 출발점은 모든 자동결제를 끊는 일이 아니라 반복 지출의 사용 빈도와 계약 조건을 확인하는 일입니다." },
      { id: "claim", type: "paragraph", text: claimText },
      { id: "source", type: "paragraph", text: `정보 기준일 및 최종 검토일은 2026년 8월 1일입니다.\n출처: ${documentUrl}` },
      { id: "image-plan", type: "image", source: "", purpose: "hero", alt: "카드 명세서와 자동결제 내역을 점검하는 모습", prompt: "카드 명세서와 자동결제 내역을 분류하는 장면" },
      { id: "conclusion", type: "paragraph", text: "계약형 지출은 실제 사용 여부와 해지 조건을 함께 확인한 뒤 유지·변경·해지 순서를 결정합니다." },
    ],
  };
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [{ id: "brand-1", workspaceId: "workspace-1", name: "밝은재테크" }],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      brandId: "brand-1",
      name: "밝은재테크",
      description: "생활경제 콘텐츠",
      selectedPublishingAccountIds: ["wordpress-1"],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }],
    contents: [{
      id: "content-fixed-expense",
      workspaceId: "workspace-1",
      projectId: "project-1",
      brandId: "brand-1",
      title: document.title,
      body: "",
      status: "in_review",
      contentType: "article",
      platform: "wordpress",
      primaryKeyword: "고정지출 줄이는 방법",
      searchIntent: "고정지출을 줄이기 전에 계약 조건을 확인하는 순서",
      publishingAccountId: "wordpress-1",
      selectedPublishingAccountIds: ["wordpress-1"],
      publishingPreparation: { wordpress: { publishingAccountId: "wordpress-1", categoryIds: ["2"], categoryNames: ["생활재테크"], updatedAt: "2026-08-01T00:00:00.000Z" } },
      document,
      quality: standardQuality(document),
      updatedAt: "2026-08-01T00:00:00.000Z",
      contentPurpose: "adsense_approval",
      approvalPolicyId: "adsense_approval_mode",
      approvalPolicyVersion: "1.0",
      approvalProfileId: "wordpress_life_economy_v1",
      approvalProfileVersion: "1.0",
    } as UserData["contents"][number]],
  };
}

describe("current WordPress source regression", () => {
  it("normalizes, verifies, projects, and renders the linked law Claims without changing Standard Quality", async () => {
    const raw = fixture();
    const normalized = normalizeApprovalEvidenceCandidates(raw, "content-fixed-expense");
    expect(raw.contents[0]?.document?.metadata?.approvalEvidence?.sources).toHaveLength(4);
    expect(normalized.contents[0]?.document?.metadata?.approvalEvidence?.sources).toHaveLength(1);

    const fetcher = vi.fn(async () => new Response(
      "<html><head><title>국가법령정보센터 | 조문정보</title></head><body>" +
      "방문판매 등에 관한 법률 제30조에 따라 계속거래업자는 계약서를 소비자에게 발급하여야 한다. 제32조는 손실을 현저하게 초과하는 위약금 청구를 금지하며 실제 공급된 재화등의 대가를 초과하여 수령한 대금의 환급을 부당하게 거부하지 못하도록 한다. ".repeat(4) +
      "</body></html>",
      { status: 200, headers: { "content-type": "text/html;charset=UTF-8" } },
    ));
    const result = await new ApprovalReadinessApplicationService(
      fetcher,
      () => "2026-08-01T02:00:00.000Z",
    ).execute({ data: normalized, contentId: "content-fixed-expense" });
    const source = result.evidence.pack.sources[0];
    const html = new WordPressHtmlRenderer().render(result.document);
    const approvalQuality = result.quality as ApprovalAwareQualityReport;

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.evidence.pack).toMatchObject({ status: "verified", coverageStatus: "verified", reviewedAt: "2026-08-01T02:00:00.000Z" });
    expect(source).toMatchObject({
      canonicalUrl,
      provenance: "citation",
      selected: true,
      verified: true,
      linkedBlockIds: expect.arrayContaining(["claim", "source"]),
    });
    expect(source?.matchedFacts?.map((fact) => fact.field)).toEqual(expect.arrayContaining([
      "continuingTransactionContractDocument",
      "excessiveTerminationPenalty",
      "excessPaymentRefund",
    ]));
    expect(result.document.blocks).toContainEqual(expect.objectContaining({
      id: "approval-source-link-1",
      targetUrl: canonicalUrl,
      label: "방문판매 등에 관한 법률 제30조·제32조 · 국가법령정보센터",
      ownership: "system_source_projection",
    }));
    expect(result.quality).toMatchObject({ approved: true, approvalType: "standard" });
    expect(result.quality.reviewedRevisionId).toBe(editorialRevisionId(result.document));
    expect(approvalQuality.approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "standard_quality", status: "passed" }));
    expect(approvalQuality.approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
    expect(approvalQuality.approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "site_readiness", status: "needs_review" }));
    expect(html).toContain('<a class="wp-block-button__link" href="https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&amp;lsJoLnkSeq=1025033501"');
    expect(html).not.toContain("(law.go.kr)");
    expect(html).not.toContain(`출처: ${documentUrl}`);
    expect(evaluateHtmlIntegrity(result.document, html)).toEqual({ passed: true, issues: [] });
  });
});
