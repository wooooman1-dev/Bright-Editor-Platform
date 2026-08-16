import { describe, expect, it } from "vitest";

import { corroborateApprovalReadinessResult } from "../../../../../app/application/approval/CorroborationApprovalService";
import type { ApprovalReadinessExecutionResult } from "../../../../../app/application/approval/ApprovalReadinessApplicationServiceBase";
import type { UserContent, UserData } from "../../../../../app/user-flow/user-data";
import type { ApprovalEvidencePack, SiteApprovalReadinessSnapshot } from "../../../../../core/approval";
import { resolveApprovalPolicySnapshot } from "../../../../../core/approval";
import type { ContentDocument } from "../../../../../core/content";
import type { QualityReport } from "../../../../../core/quality";

const profileId = "wordpress_life_economy_v1" as const;
const originalUrl = "https://blog.example.com/support";
const corroboratingUrl = "https://public.example.org/support";
const claimText = "지원 대상: 만 19세 이상 신청자";

const document: ContentDocument = {
  id: "content-corroboration",
  title: "지원 대상 확인",
  blocks: [
    { id: "intro", type: "paragraph", text: "정부 지원 제도의 지원 대상을 확인합니다." },
    { id: "claim", type: "paragraph", text: claimText },
  ],
  metadata: {
    buttonCount: 0,
    createdAt: "2026-08-16T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "test",
    updatedAt: "2026-08-16T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 30,
    approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", profileId)!,
    approvalEvidence: undefined,
  },
};

const source = {
  sourceId: "unofficial-source",
  url: originalUrl,
  title: "지원 대상 안내",
  publisher: "blog.example.com",
  sourceType: "official_institution" as const,
  retrievedAt: "2026-08-16T00:00:00.000Z",
  verified: false,
  facts: [{ field: "eligibility", value: "만 19세 이상 신청자" }],
  matchedFacts: [{ field: "eligibility", value: "만 19세 이상 신청자" }],
  provenance: "citation" as const,
  cited: true,
  selected: true,
  official: false,
  verificationStatus: "needs_corroboration" as const,
};

const evidence: ApprovalEvidencePack = {
  version: "1.0",
  status: "needs_review",
  coverageStatus: "needs_review",
  sourcePolicyCompliance: "failed",
  sources: [source],
};

const quality: QualityReport = {
  approved: true,
  approvalType: "standard",
  approvalState: "approved",
  findings: [],
  overallScore: 100,
  reviews: [],
  dimensions: [],
  tasks: [],
  reviewedAt: "2026-08-16T00:00:00.000Z",
  reviewedRevisionId: "revision-1",
  weights: { searchIntent: 0, seo: 0, readability: 0, structure: 0, completeness: 0, usefulness: 0, htmlQuality: 0, imageStrategy: 0, internalLinks: 0, cta: 0 },
};

const content = {
  id: document.id,
  workspaceId: "workspace-1",
  projectId: "project-1",
  brandId: "brand-1",
  title: document.title,
  body: "",
  status: "in_review",
  contentType: "article",
  platform: "wordpress",
  primaryKeyword: "지원 대상",
  searchIntent: "지원 대상 확인",
  publishingAccountId: "wordpress-1",
  selectedPublishingAccountIds: ["wordpress-1"],
  document,
  quality,
  updatedAt: "2026-08-16T00:00:00.000Z",
  contentPurpose: "adsense_approval",
  approvalProfileId: profileId,
  approvalProfileVersion: "1.0",
} as unknown as UserContent;

const data = {
  contents: [content],
  qualityReports: [{ contentId: content.id, report: quality }],
} as unknown as UserData;

const siteReadiness: SiteApprovalReadinessSnapshot = {
  version: "1.0",
  status: "passed",
  checkedAt: "2026-08-16T00:00:00.000Z",
  checks: [],
};

function html(title: string): string {
  return `<html><head><title>${title}</title></head><body>${claimText.repeat(30)}</body></html>`;
}

function fetcher() {
  return async (input: string | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("https://html.duckduckgo.com/")) {
      return new Response(
        `<html><body><a class="result__a" href="${originalUrl}">같은 기관</a><a class="result__a" href="${corroboratingUrl}">공공기관 안내</a></body></html>`,
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (url === originalUrl) return new Response(html("원래 안내"), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    if (url === corroboratingUrl) return new Response(html("공공기관 안내"), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  };
}

describe("CorroborationApprovalService", () => {
  it("searches after an unofficial Evidence verdict and upgrades the pack when an independent source corroborates the Claim", async () => {
    const resultDocument = {
      ...document,
      metadata: { ...document.metadata, approvalEvidence: evidence },
    } as ContentDocument;
    const result: ApprovalReadinessExecutionResult = {
      data,
      document: resultDocument,
      quality,
      evidence: {
        pack: evidence,
        verifiedSourceCount: 0,
        rejectedSourceCount: 1,
        reasons: ["보강 필요"],
      },
      siteReadiness,
      inspectionPerformed: true,
    };

    const next = await corroborateApprovalReadinessResult(
      result,
      content,
      profileId,
      fetcher(),
      "2026-08-16T01:00:00.000Z",
    );

    expect(next.evidence.pack.status).toBe("verified");
    expect(next.evidence.pack.sources).toHaveLength(2);
    expect(next.evidence.pack.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: originalUrl,
        verified: true,
        trustRoute: "external_corroborated",
      }),
      expect.objectContaining({
        url: corroboratingUrl,
        verified: true,
        trustRoute: "external_corroborated",
        provenance: "system_verified",
      }),
    ]));
    const readiness = (next.quality as QualityReport & {
      approvalReadiness?: { checks: readonly { key: string; status: string }[] };
    }).approvalReadiness;
    expect(readiness?.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "evidence", status: "passed" }),
    ]));
  });
});
