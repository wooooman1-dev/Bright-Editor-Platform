import { describe, expect, it, vi } from "vitest";

import { ApprovalReadinessApplicationService } from "../../../../../app/application/approval/ApprovalReadinessApplicationService";
import {
  resolveApprovalPolicySnapshot,
  SiteApprovalReadinessAdapterRegistry,
  type ApprovalEvidencePack,
  type SiteApprovalReadinessAdapter,
} from "../../../../../core/approval";
import type { PlatformConnection } from "../../../../../core/connections";
import type { ContentDocument } from "../../../../../core/content";
import { editorialRevisionId, type ApprovalAwareQualityReport, type QualityReport } from "../../../../../core/quality";
import type { UserData } from "../../../../../app/user-flow/user-data";

const sourceUrl = "https://www.moma.org/collection/works/79802";
const policy = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
const candidateEvidence: ApprovalEvidencePack = {
  version: "1.0",
  status: "needs_review",
  sources: [{
    sourceId: "museum-1",
    url: sourceUrl,
    title: "The Starry Night",
    publisher: "www.moma.org",
    sourceType: "official_institution",
    retrievedAt: "2026-07-27T00:00:00.000Z",
    verified: false,
    provenance: "citation",
    cited: true,
    selected: true,
    linkedBlockIds: ["p1"],
    facts: [{ field: "citedContext", value: "공식 페이지 후보" }],
  }],
};

const document: ContentDocument = {
  id: "content-1",
  title: "별이 빛나는 밤 감상 순서",
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 3,
    source: "test",
    updatedAt: "2026-07-27T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 300,
    metaDescription: "별이 빛나는 밤의 제작연도와 소장처를 공식 자료로 확인하고 작품을 보는 순서를 안내합니다.",
    approvalPolicy: policy,
    approvalEvidence: candidateEvidence,
    approvalDuplicateCheck: {
      version: "1.0",
      status: "passed",
      checkedAt: "2026-07-27T00:00:00.000Z",
      comparedContentIds: [],
      reasons: [],
    },
    internalLinkCatalogStatus: "evaluated",
    availableRelatedContentCandidates: 0,
  },
  blocks: [
    { id: "intro", type: "paragraph", text: "별이 빛나는 밤은 화면의 소용돌이와 마을의 정적인 형태를 순서대로 비교하면 구도가 선명해집니다." },
    { id: "h1", type: "heading", level: 2, text: "작품 기본 정보" },
    { id: "p1", type: "paragraph", text: `작품명: The Starry Night\n제작연도: 1889년\n소장처: The Museum of Modern Art\n공식 페이지: ${sourceUrl}` },
    { id: "h2", type: "heading", level: 2, text: "작품을 보는 순서" },
    { id: "p2", type: "paragraph", text: "먼저 하늘의 소용돌이를 보고, 다음으로 사이프러스와 마을의 수직·수평 대비를 확인합니다. 마지막으로 밝은 별과 어두운 전경이 만드는 리듬을 비교합니다." },
  ],
};

function standardQuality(value: ContentDocument): QualityReport {
  return {
    approved: true,
    approvalType: "standard",
    approvalState: "approved",
    findings: [],
    overallScore: 100,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt: "2026-07-27T00:00:00.000Z",
    reviewedRevisionId: editorialRevisionId(value),
    weights: { searchIntent: 0, seo: 0, readability: 0, structure: 0, completeness: 0, usefulness: 0, htmlQuality: 0, imageStrategy: 0, internalLinks: 0, cta: 0 },
  };
}

const data: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [{ id: "brand-1", workspaceId: "workspace-1", name: "비바레인" }],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    brandId: "brand-1",
    name: "미술사 안내 가이드",
    description: "서양미술 감상",
    selectedPublishingAccountIds: ["tistory-1"],
    strategy: {
      primaryTopic: "미술",
      subtopics: [],
      excludedTopics: [],
      defaultContentType: "article",
      defaultPlatform: "tistory",
      targetAudience: "미술 초보",
      tone: "clear",
      internalLinkPolicy: "real",
      relatedPostPolicy: "real",
      ctaPolicy: "optional",
      imageStrategy: "placeholder",
      seoPolicy: "people-first",
      defaultPublishingAccountId: "tistory-1",
    },
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    brandId: "brand-1",
    title: document.title,
    body: "",
    status: "in_review",
    contentType: "article",
    platform: "tistory",
    primaryKeyword: "별이 빛나는 밤",
    searchIntent: "작품 감상 방법",
    publishingAccountId: "tistory-1",
    selectedPublishingAccountIds: ["tistory-1"],
    document,
    quality: standardQuality(document),
    updatedAt: "2026-07-27T00:00:00.000Z",
    contentPurpose: "adsense_approval",
    approvalPolicyId: "adsense_approval_mode",
    approvalPolicyVersion: "1.0",
    approvalProfileId: "tistory_vivarain_art_v1",
    approvalProfileVersion: "1.0",
  } as UserData["contents"][number]],
};

const connection: PlatformConnection = {
  id: "tistory-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "viva-rain",
  status: "connected",
  publicMetadata: {
    blogId: "viva-rain",
    blogUrl: "https://viva-rain.tistory.com",
    sessionStateAvailable: true,
  },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  lastVerifiedAt: "2026-07-27T00:00:00.000Z",
  selectedAsDefault: false,
  version: 1,
};

const siteHtml = `<!doctype html><html lang="ko"><head><title>비바레인 미술</title><meta name="viewport" content="width=device-width"><meta name="description" content="미술 초보를 위한 서양미술 감상"></head><body><nav class="menu"><a href="/">홈</a><a href="/category/미술">카테고리</a><a href="/entry/one">글1</a><a href="/entry/two">글2</a><a href="/pages/about">사이트 소개</a><a href="/pages/contact">문의</a><a href="/pages/privacy">개인정보 처리방침</a></nav><main>${"비바레인은 미술 작품을 차근차근 감상하도록 안내합니다. ".repeat(20)}</main></body></html>`;
const sourceHtml = `<!doctype html><html><head><title>The Starry Night | MoMA</title><meta property="og:site_name" content="The Museum of Modern Art"></head><body>${"The Starry Night was created in 1889 and is held by The Museum of Modern Art. Museum collection record. ".repeat(8)}</body></html>`;

function fetcher() {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "HEAD") return new Response("", { status: 200 });
    if (url === sourceUrl) return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
    return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
  });
}

describe("ApprovalReadinessApplicationService", () => {
  it("skips source verification and persists not-required Evidence when Planning has no mandatory Claim", async () => {
    const noEvidenceData: UserData = {
      ...data,
      contents: [{
        ...data.contents[0]!,
        opportunity: {
          requiredEvidenceContract: {
            schemaVersion: 1,
            contractId: "contract-optional-evidence",
            policyId: "adsense_approval_mode",
            policyVersion: "1.0",
            profileId: "tistory_vivarain_art_v1",
            profileVersion: "1.0",
            profileSourceRequirementApplicable: false,
            explicitVerificationRequired: false,
            sourceRequirements: [],
            requiredClaims: [],
          },
        },
      } as unknown as UserData["contents"][number]],
    };
    const request = fetcher();
    const result = await new ApprovalReadinessApplicationService(
      request,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data: noEvidenceData, contentId: "content-1", connection });

    expect(request.mock.calls.some(([input]) => String(input) === sourceUrl)).toBe(false);
    expect(result.evidence.pack).toMatchObject({
      status: "not_required",
      coverageStatus: "not_required",
      sourcePolicyCompliance: "not_required",
      sources: [],
    });
    expect((result.quality as ApprovalAwareQualityReport).approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "passed",
      applicable: false,
    }));
  });

  it("verifies official Evidence, adds visible review metadata, audits the public Tistory site, and persists new snapshots", async () => {
    const result = await new ApprovalReadinessApplicationService(
      fetcher(),
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data, contentId: "content-1", connection });
    const approvalQuality = result.quality as ApprovalAwareQualityReport;

    expect(result.evidence.pack.status).toBe("verified");
    expect(result.siteReadiness.status).toBe("passed");
    expect(result.document.metadata?.approvalEvidence?.reviewedAt).toBe("2026-07-27T10:30:00.000Z");
    expect(result.document.metadata?.siteApprovalReadiness?.status).toBe("passed");
    expect(result.document.blocks).toContainEqual(expect.objectContaining({
      id: "approval-review-date",
      ownership: "system_source_projection",
      text: "출처 확인일: 2026-07-27 · Claim 최종 검토일: 2026-07-27",
    }));
    expect(result.document.blocks).toContainEqual(expect.objectContaining({
      id: "approval-source-link-1",
      type: "button",
      purpose: "source",
      targetUrl: sourceUrl,
      target: "_blank",
    }));
    expect(approvalQuality.approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "passed" }));
    expect(approvalQuality.approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "site_readiness", status: "passed" }));
    expect(result.data.contents[0]?.quality?.reviewedRevisionId).toBe(result.quality.reviewedRevisionId);
  });

  it("reuses a verified result after refresh without repeating source or site checks", async () => {
    const firstFetcher = fetcher();
    const first = await new ApprovalReadinessApplicationService(
      firstFetcher,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data, contentId: "content-1", connection });
    const refreshedFetcher = fetcher();

    const refreshed = await new ApprovalReadinessApplicationService(
      refreshedFetcher,
      () => "2026-07-27T11:30:00.000Z",
    ).execute({ data: first.data, contentId: "content-1", connection });

    expect(refreshedFetcher).not.toHaveBeenCalled();
    expect(refreshed.document.metadata?.approvalReadinessExecution?.checkedAt).toBe("2026-07-27T10:30:00.000Z");
    expect(refreshed.evidence.pack.status).toBe("verified");
  });

  it("reuses a needs-review result after refresh without an automatic retry", async () => {
    const unavailable = vi.fn(async (input: string | URL) => {
      if (String(input) === sourceUrl) throw new TypeError("source unavailable");
      return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
    });
    const first = await new ApprovalReadinessApplicationService(
      unavailable,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data, contentId: "content-1", connection });
    const refreshedFetcher = fetcher();

    const refreshed = await new ApprovalReadinessApplicationService(
      refreshedFetcher,
      () => "2026-07-27T11:30:00.000Z",
    ).execute({ data: first.data, contentId: "content-1", connection });

    expect(refreshedFetcher).not.toHaveBeenCalled();
    expect(refreshed.evidence.pack.status).toBe("needs_review");
    expect(refreshed.document.metadata?.approvalReadinessExecution?.checkedAt).toBe("2026-07-27T10:30:00.000Z");
  });

  it("preserves an editorial source section and reports a projection conflict instead of creating a duplicate", async () => {
    const editorialDocument: ContentDocument = {
      ...document,
      blocks: [
        ...document.blocks,
        { id: "editorial-sources", type: "heading", level: 2, ownership: "ai_editorial", text: "참고 자료" },
        { id: "editorial-source-link", type: "button", ownership: "ai_editorial", purpose: "source", label: "MoMA 원문", targetUrl: sourceUrl },
      ],
    };
    const editorialData: UserData = {
      ...data,
      contents: [{
        ...data.contents[0]!,
        document: editorialDocument,
        quality: standardQuality(editorialDocument),
      }],
    };

    const result = await new ApprovalReadinessApplicationService(
      fetcher(),
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data: editorialData, contentId: "content-1", connection });

    expect(result.document.blocks).toContainEqual(expect.objectContaining({ id: "editorial-sources", ownership: "ai_editorial" }));
    expect(result.document.blocks).not.toContainEqual(expect.objectContaining({ id: "approval-sources-heading" }));
    expect(result.evidence.pack).toMatchObject({ presentationStatus: "conflict" });
    expect((result.quality as ApprovalAwareQualityReport).approvalReadiness?.checks).toContainEqual(expect.objectContaining({ key: "evidence", status: "needs_review" }));
  });

  it("retries a rate-limited source and never fetches official candidates concurrently", async () => {
    const secondSourceUrl = "https://www.moma.org/collection/works/79803";
    const retryEvidence: ApprovalEvidencePack = {
      ...candidateEvidence,
      sources: [
        candidateEvidence.sources[0]!,
        { ...candidateEvidence.sources[0]!, sourceId: "museum-2", url: secondSourceUrl },
      ],
    };
    const retryDocument: ContentDocument = {
      ...document,
      metadata: { ...document.metadata!, approvalEvidence: retryEvidence },
    };
    const retryData: UserData = {
      ...data,
      contents: [{ ...data.contents[0]!, document: retryDocument, quality: standardQuality(retryDocument) }],
    };

    let activeSourceRequests = 0;
    let maxActiveSourceRequests = 0;
    let firstSourceAttempts = 0;
    const sourceUrls = new Set([sourceUrl, secondSourceUrl]);
    const controlledFetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "HEAD") return new Response("", { status: 200 });
      if (!sourceUrls.has(url)) return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });

      activeSourceRequests += 1;
      maxActiveSourceRequests = Math.max(maxActiveSourceRequests, activeSourceRequests);
      try {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (url === sourceUrl) {
          firstSourceAttempts += 1;
          if (firstSourceAttempts === 1) {
            return new Response("Too many requests", {
              status: 429,
              headers: { "content-type": "text/html", "retry-after": "0" },
            });
          }
        }
        return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
      } finally {
        activeSourceRequests -= 1;
      }
    });

    const result = await new ApprovalReadinessApplicationService(
      controlledFetcher,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data: retryData, contentId: "content-1", connection });

    expect(firstSourceAttempts).toBe(2);
    expect(maxActiveSourceRequests).toBe(1);
    expect(result.evidence.pack.status).toBe("verified");
    expect(result.evidence.verifiedSourceCount).toBe(2);
  });

  it("preserves the concrete source fetch error in the Evidence diagnostic", async () => {
    const controlledFetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === sourceUrl) throw new TypeError("fetch failed: ECONNRESET");
      return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
    });

    const result = await new ApprovalReadinessApplicationService(
      controlledFetcher,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data, contentId: "content-1", connection });

    expect(result.evidence.pack.status).toBe("needs_review");
    expect(result.evidence.pack.sources[0]).toMatchObject({
      verificationStatus: "unreachable",
      httpStatus: 0,
      failureReason: expect.stringContaining("ECONNRESET"),
    });
  });

  it("uses the official NGA Open Data record when an artwork page is blocked", async () => {
    const ngaSourceUrl = "https://www.nga.gov/artworks/1167-portrait-man";
    const ngaDatasetUrl = "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects.csv";
    const ngaEvidence: ApprovalEvidencePack = {
      ...candidateEvidence,
      sources: [{
        ...candidateEvidence.sources[0]!,
        sourceId: "nga-1167",
        url: ngaSourceUrl,
        title: "Portrait of a Man",
        publisher: "National Gallery of Art",
        linkedBlockIds: ["p"],
      }],
    };
    const ngaDocument: ContentDocument = {
      ...document,
      title: "Portrait of a Man 감상 가이드",
      metadata: { ...document.metadata!, approvalEvidence: ngaEvidence },
      blocks: [
        { id: "h", type: "heading", level: 2, text: "작품 기본 정보" },
        { id: "p", type: "paragraph", text: "작품명: Portrait of a Man\n제작연도: 1648년\n재료: oil on canvas\n크기: 63.5 x 53.5 cm\n소장처: National Gallery of Art" },
      ],
    };
    const ngaData: UserData = {
      ...data,
      contents: [{
        ...data.contents[0]!,
        title: ngaDocument.title,
        primaryKeyword: "Portrait of a Man",
        document: ngaDocument,
        quality: standardQuality(ngaDocument),
      }],
    };
    const csv = [
      "objectid,title,displaydate,beginyear,endyear,medium,dimensions,attribution,accessionnum,creditline,classification",
      "1102,Earlier Work,c. 1835,1835,1835,oil on canvas,50 x 40 cm,American 19th Century,1947.1.1,Gift,Painting",
      "1167,Portrait of a Man,1648/1650,1648,1650,oil on canvas,\"overall: 63.5 x 53.5 cm (25 x 21 1/16 in.)\",Frans Hals,1942.9.28,Widener Collection,Painting",
      "1200,Later Work,1700,1700,1700,oil on panel,40 x 30 cm,Unknown,1950.1.1,Gift,Painting",
    ].join("\n");
    const controlledFetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "HEAD") return new Response("", { status: 200 });
      if (url === ngaSourceUrl) {
        return new Response("<title>Just a moment...</title>", {
          status: 403,
          headers: { "content-type": "text/html; charset=UTF-8" },
        });
      }
      if (url === ngaDatasetUrl) {
        return new Response(csv, {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
      }
      return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
    });

    const result = await new ApprovalReadinessApplicationService(
      controlledFetcher,
      () => "2026-07-27T10:30:00.000Z",
    ).execute({ data: ngaData, contentId: "content-1", connection });

    expect(controlledFetcher).toHaveBeenCalledWith(ngaDatasetUrl, expect.objectContaining({ method: "GET" }));
    expect(result.evidence.pack.status).toBe("verified");
    expect(result.evidence.verifiedSourceCount).toBe(1);
    expect(result.evidence.pack.sources[0]).toMatchObject({
      verified: true,
      verificationStatus: "verified",
      publisher: "National Gallery of Art Open Data",
      finalUrl: ngaSourceUrl,
      contentType: "text/html; normalized-from=text/csv",
    });
  });

  it("audits WordPress site identity with the stored brand instead of content-domain or legacy policy terms", async () => {
    const audit = vi.fn<SiteApprovalReadinessAdapter["audit"]>(async () =>
      siteSnapshot("wordpress-identity"));
    const adapters = new SiteApprovalReadinessAdapterRegistry([
      adapter("wordpress", audit),
    ]);
    const approvalPolicy = {
      ...resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      siteIdentity: "생활경제",
    };
    const wordpressDocument: ContentDocument = {
      ...document,
      metadata: {
        ...document.metadata!,
        approvalPolicy,
      },
    };
    const wordpressData: UserData = {
      ...data,
      brands: [{ id: "brand-bright", workspaceId: "workspace-1", name: "밝은재테크" }],
      projects: [{
        ...data.projects[0]!,
        brandId: "brand-bright",
        name: "밝은재테크",
        strategy: {
          ...data.projects[0]!.strategy!,
          primaryTopic: "생활경제",
          defaultPlatform: "wordpress",
        },
      }],
      contents: [{
        ...data.contents[0]!,
        brandId: "brand-bright",
        platform: "wordpress",
        document: wordpressDocument,
        quality: standardQuality(wordpressDocument),
        approvalProfileId: "wordpress_life_economy_v1",
      } as UserData["contents"][number] & { approvalProfileId: "wordpress_life_economy_v1" }],
    };
    const wordpressConnection: PlatformConnection = {
      ...connection,
      id: "wordpress-1",
      platform: "wordpress",
      displayName: "밝은재테크",
      publicMetadata: { siteUrl: "https://example.com" },
    };

    await new ApprovalReadinessApplicationService(
      fetcher(),
      () => "2026-07-27T10:30:00.000Z",
      adapters,
    ).execute({ data: wordpressData, contentId: "content-1", connection: wordpressConnection });

    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      expectedTerms: ["밝은재테크"],
    }));
    expect(audit.mock.calls[0]?.[0].expectedTerms).not.toContain("생활경제");
  });

  it.each([
    ["wordpress", "wordpress-audit"],
    ["tistory", "tistory-audit"],
  ] as const)("selects only the registered %s site readiness Adapter", async (platform, selectedKey) => {
    const wordpressAudit = vi.fn(async () => siteSnapshot("wordpress-audit"));
    const tistoryAudit = vi.fn(async () => siteSnapshot("tistory-audit"));
    const adapters = new SiteApprovalReadinessAdapterRegistry([
      adapter("wordpress", wordpressAudit),
      adapter("tistory", tistoryAudit),
    ]);
    const selectedConnection: PlatformConnection = {
      ...connection,
      id: `${platform}-1`,
      platform,
      publicMetadata: platform === "wordpress"
        ? { siteUrl: "https://example.com" }
        : { blogUrl: "https://viva-rain.tistory.com" },
    };

    const result = await new ApprovalReadinessApplicationService(
      fetcher(),
      () => "2026-07-27T10:30:00.000Z",
      adapters,
    ).execute({ data, contentId: "content-1", connection: selectedConnection });

    expect(result.siteReadiness.checks[0]).toMatchObject({ key: selectedKey });
    expect(wordpressAudit).toHaveBeenCalledTimes(platform === "wordpress" ? 1 : 0);
    expect(tistoryAudit).toHaveBeenCalledTimes(platform === "tistory" ? 1 : 0);
    const selectedAudit = platform === "wordpress" ? wordpressAudit : tistoryAudit;
    expect(selectedAudit).toHaveBeenCalledWith(expect.objectContaining({
      connection: selectedConnection,
      expectedTerms: ["비바레인"],
    }));
  });
});

function adapter(
  platform: "tistory" | "wordpress",
  audit: SiteApprovalReadinessAdapter["audit"],
): SiteApprovalReadinessAdapter {
  return { platform, audit };
}

function siteSnapshot(key: string) {
  return Object.freeze({
    version: "1.0" as const,
    status: "needs_review" as const,
    checkedAt: "2026-07-27T10:30:00.000Z",
    checks: Object.freeze([Object.freeze({ key, passed: false, message: key })]),
  });
}
