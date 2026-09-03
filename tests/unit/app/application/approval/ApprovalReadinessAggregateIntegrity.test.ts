import { describe, expect, it, vi } from "vitest";

import { applyApprovalPersistencePolicy } from "../../../../../app/application/approval/ApprovalAwarePersistenceStore";
import { normalizeApprovalEvidenceCandidates } from "../../../../../app/application/approval/ApprovalEvidenceCandidateNormalization";
import { ApprovalReadinessApplicationService } from "../../../../../app/application/approval/ApprovalReadinessApplicationService";
import { ApprovalReadinessApplicationService as BaseApprovalReadinessApplicationService } from "../../../../../app/application/approval/ApprovalReadinessApplicationServiceBase";
import { approvalReadinessExecutionIdentity } from "../../../../../app/application/approval/ApprovalReadinessExecutionIdentity";
import type { UserContent, UserData } from "../../../../../app/user-flow/user-data";
import {
  approvalReadinessCheckKeys,
  approvalReadinessInspectionVersion,
  deriveApprovalReadinessReport,
  resolveApprovalPolicySnapshot,
  type ApprovalReadinessCheck,
  type ApprovalReadinessReport,
} from "../../../../../core/approval";
import type { PlatformConnection } from "../../../../../core/connections";
import type { ContentDocument } from "../../../../../core/content";
import { editorialRevisionId, type ApprovalAwareQualityReport, type QualityReport } from "../../../../../core/quality";

const policy = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;

/**
 * The manuscript itself is deliberately uninteresting: every check under test is
 * decided by the stored inspection snapshots, not by the prose.
 */
function baseDocument(metadata: Partial<NonNullable<ContentDocument["metadata"]>> = {}): ContentDocument {
  return {
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
      metaDescription: "별이 빛나는 밤을 보는 순서를 단계별로 안내합니다.",
      approvalPolicy: policy,
      approvalDuplicateCheck: {
        version: "1.0",
        status: "passed",
        checkedAt: "2026-07-27T00:00:00.000Z",
        comparedContentIds: [],
        reasons: [],
      },
      internalLinkCatalogStatus: "evaluated",
      availableRelatedContentCandidates: 0,
      siteApprovalReadiness: {
        version: "1.0",
        status: "passed",
        checkedAt: "2026-07-27T00:00:00.000Z",
        checks: [{ key: "public_access", passed: true, message: "공개 홈페이지가 정상 응답했습니다.", requirement: "required" }],
      },
      approvalEvidence: {
        version: "1.0",
        status: "not_required",
        coverageStatus: "not_required",
        sourcePolicyCompliance: "not_required",
        sources: [],
      },
      ...metadata,
    },
    blocks: [
      { id: "intro", type: "paragraph", text: "별이 빛나는 밤은 화면의 소용돌이와 마을의 정적인 형태를 순서대로 비교하면 구도가 선명해집니다." },
      { id: "h2", type: "heading", level: 2, text: "작품을 보는 순서" },
      { id: "p2", type: "paragraph", text: "먼저 하늘의 소용돌이를 보고, 다음으로 사이프러스와 마을의 수직·수평 대비를 확인합니다. 마지막으로 밝은 별과 어두운 전경이 만드는 리듬을 비교합니다." },
      // Approval articles are expected to tell the reader where to check, so the
      // baseline fixture carries a confirmation path like a real manuscript.
      { id: "p3", type: "paragraph", text: "소장처 공식 페이지 https://www.moma.org/collection/works/79802 에서 작품 정보를 직접 확인할 수 있습니다." },
    ],
  };
}

/** Planning contract with no CRITICAL Claim, so mandatory Evidence does not apply. */
const noMandatoryEvidenceOpportunity = {
  verificationPlan: { schemaVersion: 1, claims: [] },
} as unknown as UserContent["opportunity"];

function standardQuality(document: ContentDocument, approved = true): QualityReport {
  return {
    approved,
    approvalType: approved ? "standard" : "none",
    approvalState: approved ? "approved" : "improvement_required",
    findings: [],
    overallScore: approved ? 100 : 92,
    reviews: [],
    dimensions: [],
    tasks: [],
    reviewedAt: "2026-07-27T00:00:00.000Z",
    reviewedRevisionId: editorialRevisionId(document),
    weights: { searchIntent: 0, seo: 0, readability: 0, structure: 0, completeness: 0, usefulness: 0, htmlQuality: 0, imageStrategy: 0, internalLinks: 0, cta: 0, concreteness: 0, readerDeferral: 0, evidenceUse: 0, formality: 0 },
  };
}

/**
 * The aggregate as content-msmjpvq5-tjoeah actually had it stored: every check
 * passed except a `site_readiness` that claims the site was never inspected,
 * while the document carries a passing site audit snapshot.
 */
function staleAggregate(): ApprovalReadinessReport {
  const checks: ApprovalReadinessCheck[] = [
    { key: "standard_quality", status: "passed", message: "현재 문서 버전이 기본 품질 승인을 통과했습니다." },
    { key: "approval_policy", status: "passed", message: "승인 준비 정책의 결정적 금지 항목을 통과했습니다." },
    { key: "evidence", status: "passed", message: "현재 원고에는 mandatory Evidence가 적용되지 않습니다.", applicable: false },
    { key: "duplicate", status: "passed", message: "기존 콘텐츠 0개와의 중복 검사를 통과했습니다." },
    { key: "internal_links", status: "passed", message: "본문 내부 링크 1개와 하단 관련 글 0개가 배치되었습니다." },
    { key: "site_readiness", status: "not_evaluated", message: "사이트 전체 승인 준비 검사가 실행되지 않았습니다.", action: "메뉴·카테고리·개인정보처리방침·깨진 링크·모바일·공개 접근 상태를 자동 검사하세요." },
  ];
  return { status: "needs_review", applicationReady: false, checks };
}

function content(input: Readonly<{
  document: ContentDocument;
  quality?: QualityReport & Readonly<{ approvalReadiness?: ApprovalReadinessReport }>;
  /** Omit to leave Evidence applicability unknown, which keeps verification on. */
  opportunity?: UserContent["opportunity"];
}>): UserContent {
  return {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    brandId: "brand-1",
    title: input.document.title,
    body: "",
    status: "in_review",
    contentType: "article",
    platform: "tistory",
    primaryKeyword: "별이 빛나는 밤",
    searchIntent: "작품 감상 방법",
    publishingAccountId: "tistory-1",
    selectedPublishingAccountIds: ["tistory-1"],
    document: input.document,
    ...(input.quality ? { quality: input.quality } : {}),
    ...("opportunity" in input ? { opportunity: input.opportunity } : { opportunity: noMandatoryEvidenceOpportunity }),
    updatedAt: "2026-07-27T00:00:00.000Z",
    contentPurpose: "adsense_approval",
    approvalPolicyId: "adsense_approval_mode",
    approvalPolicyVersion: "1.0",
    approvalProfileId: "tistory_vivarain_art_v1",
    approvalProfileVersion: "1.0",
  } as unknown as UserContent;
}

function userData(item: UserContent): UserData {
  const quality = item.quality;
  return {
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
    contents: [item],
    ...(quality ? { qualityReports: [{ contentId: item.id, report: quality }] } : {}),
  } as unknown as UserData;
}

const connection: PlatformConnection = {
  id: "tistory-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "viva-rain",
  status: "connected",
  publicMetadata: { blogId: "viva-rain", blogUrl: "https://viva-rain.tistory.com", sessionStateAvailable: true },
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  lastVerifiedAt: "2026-07-27T00:00:00.000Z",
  selectedAsDefault: false,
  version: 1,
};

const siteHtml = `<!doctype html><html lang="ko"><head><title>비바레인 미술</title><meta name="viewport" content="width=device-width"><meta name="description" content="미술 초보를 위한 서양미술 감상"></head><body><nav class="menu"><a href="/">홈</a><a href="/category/미술">카테고리</a><a href="/entry/one">글1</a><a href="/pages/about">사이트 소개</a><a href="/pages/contact">문의</a><a href="/pages/privacy">개인정보 처리방침</a></nav><main>${"비바레인은 미술 작품을 차근차근 감상하도록 안내합니다. ".repeat(20)}</main></body></html>`;

function liveFetcher() {
  return vi.fn(async (_input: string | URL, init?: RequestInit) => {
    if (init?.method === "HEAD") return new Response("", { status: 200 });
    return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
  });
}

function forbiddenFetcher() {
  return vi.fn(async () => {
    throw new Error("승인 준비 검사가 캐시된 결과를 재사용하지 않고 네트워크를 호출했습니다.");
  });
}

function check(report: ApprovalReadinessReport | undefined, key: ApprovalReadinessCheck["key"]): ApprovalReadinessCheck {
  const found = report?.checks.find((item) => item.key === key);
  if (!found) throw new Error(`체크 ${key}가 보고서에 없습니다.`);
  return found;
}

function storedExecution(document: ContentDocument, version: "3.0" | typeof approvalReadinessInspectionVersion) {
  const identity = approvalReadinessExecutionIdentity(content({ document }), connection.id);
  return {
    version,
    key: version === approvalReadinessInspectionVersion
      ? identity.key
      : identity.key.replace(`${approvalReadinessInspectionVersion}::`, "3.0::"),
    editorialRevisionId: identity.editorialRevisionId,
    publishingContextKey: identity.publishingContextKey,
    evidenceFingerprint: identity.evidenceFingerprint,
    status: "completed" as const,
    checkedAt: "2026-07-27T00:00:00.000Z",
  };
}

describe("approval readiness aggregate integrity", () => {
  describe("P2 · one answer per article", () => {
    it("recomputes both persisted copies so contents[].quality and qualityReports[] cannot disagree", () => {
      // Reproduces content-msmjpvq5-tjoeah: the two stored copies gave different
      // answers for site_readiness on the same revision of the same article.
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const stale = { ...standardQuality(document), approvalReadiness: staleAggregate() };
      const fresh = {
        ...standardQuality(document),
        approvalReadiness: {
          ...staleAggregate(),
          checks: staleAggregate().checks.map((item) => item.key === "site_readiness"
            ? { key: "site_readiness" as const, status: "passed" as const, message: "사이트 자동 승인 준비 검사를 통과했습니다." }
            : item),
        },
      };
      const candidate: UserData = {
        ...userData(content({ document, quality: stale })),
        qualityReports: [{ contentId: "content-1", report: fresh }],
      };

      const saved = applyApprovalPersistencePolicy(undefined, candidate);

      const fromContent = (saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness;
      const fromReport = (saved.qualityReports?.[0]?.report as ApprovalAwareQualityReport).approvalReadiness;
      expect(check(fromContent, "site_readiness").status).toBe("passed");
      expect(check(fromReport, "site_readiness").status).toBe("passed");
      expect(fromContent).toEqual(fromReport);
    });

    it("keeps a freshly computed aggregate instead of restoring the previously stored one", () => {
      // The store used to prefer the previous aggregate unconditionally, which
      // reverted the readiness service's own write in contents[].quality.
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const previous = userData(content({
        document,
        quality: { ...standardQuality(document), approvalReadiness: staleAggregate() },
      }));
      const freshReport: ApprovalReadinessReport = {
        ...staleAggregate(),
        checks: staleAggregate().checks.map((item) => item.key === "site_readiness"
          ? { key: "site_readiness" as const, status: "passed" as const, message: "사이트 자동 승인 준비 검사를 통과했습니다." }
          : item),
      };
      const candidate = userData(content({
        document,
        quality: { ...standardQuality(document), approvalReadiness: freshReport },
      }));

      const saved = applyApprovalPersistencePolicy(previous, candidate);

      const stored = (saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness;
      expect(check(stored, "site_readiness").status).toBe("passed");
      expect(stored?.applicationReady).toBe(true);
    });

    it("keeps the fresh aggregate even when the aggregate cannot be re-derived", () => {
      // Without a stored policy snapshot the reconciliation pass has nothing to
      // derive from, so the restore rule in preserveCurrentApprovalCheckSnapshots
      // is the only thing standing between a stale write and the fresh verdict.
      // Legacy approval Content in the real store is exactly this shape.
      const source = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const metadata = { ...source.metadata! };
      delete metadata.approvalPolicy;
      const document: ContentDocument = { ...source, metadata };

      const previous = userData(content({
        document,
        quality: { ...standardQuality(document), approvalReadiness: staleAggregate() },
      }));
      const freshReport: ApprovalReadinessReport = {
        ...staleAggregate(),
        checks: staleAggregate().checks.map((item) => item.key === "site_readiness"
          ? { key: "site_readiness" as const, status: "passed" as const, message: "사이트 자동 승인 준비 검사를 통과했습니다." }
          : item),
      };
      const candidate = userData(content({
        document,
        quality: { ...standardQuality(document), approvalReadiness: freshReport },
      }));

      const saved = applyApprovalPersistencePolicy(previous, candidate);

      expect(check((saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness, "site_readiness").status)
        .toBe("passed");
    });

    it("still restores the stored aggregate when a stale write drops it entirely", () => {
      const source = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const metadata = { ...source.metadata! };
      delete metadata.approvalPolicy;
      const document: ContentDocument = { ...source, metadata };

      const previous = userData(content({
        document,
        quality: { ...standardQuality(document), approvalReadiness: staleAggregate() },
      }));
      const candidate = userData(content({ document, quality: standardQuality(document) }));

      const saved = applyApprovalPersistencePolicy(previous, candidate);

      expect((saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness).toBeDefined();
    });

    /**
     * Measured on the 밝은재테크 corpus: 3 of 19 reviewed approval manuscripts
     * (`content-mslqob24-3kxlgu`, `content-mslyfk99-3t5xgy`,
     * `content-msolrz90-1msaka`) stored a policy snapshot and a Quality report
     * but no aggregate, so the editor rendered no approval-readiness panel at
     * all and their Evidence, duplicate, internal-link and site states were
     * invisible. The aggregate is derived state, so it is always written; the
     * checks that genuinely have no inspection behind them must say so rather
     * than claim a pass.
     */
    it("derives a missing aggregate instead of leaving the panel empty", () => {
      const document = baseDocument();
      const candidate = userData(content({ document, quality: standardQuality(document) }));

      const saved = applyApprovalPersistencePolicy(undefined, candidate);

      const report = (saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness;
      expect(report).toBeDefined();
      expect(report?.checks).toHaveLength(approvalReadinessCheckKeys.length);
      expect(check(report, "standard_quality").status).toBe("passed");
    });

    /**
     * Reproduces `content-msrfq4gt-fc8ub1`: `overallScore` 100, every scored
     * dimension 100, `approved: false` because of task-level rules. The panel
     * must carry those task messages, otherwise the user sees "원고 품질: 차단"
     * beside a 100 with nothing to act on.
     */
    it("carries the blocking Quality tasks into the standard_quality card", () => {
      const document = baseDocument();
      const blocked: QualityReport = {
        ...standardQuality(document, false),
        overallScore: 100,
        approvalState: "blocked",
        tasks: [
          { category: "completeness", message: "CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상수령액 조회 방법", status: "blocked" },
          { category: "completeness", message: "표를 설명하는 문장을 덧붙이세요.", status: "action_required" },
        ],
      };

      const saved = applyApprovalPersistencePolicy(undefined, userData(content({ document, quality: blocked })));

      const card = check((saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness, "standard_quality");
      expect(card.status).toBe("blocked");
      expect(card.action).toContain("CONTENT_SECTION_PROSE_INSUFFICIENT: 국민연금 예상수령액 조회 방법");
      // Non-blocking advice stays out of the blocking list.
      expect(card.action).not.toContain("표를 설명하는 문장을 덧붙이세요.");
    });

    it("writes the same derived aggregate into the mirrored quality report", () => {
      const document = baseDocument();
      const candidate = userData(content({ document, quality: standardQuality(document) }));

      const saved = applyApprovalPersistencePolicy(undefined, candidate);

      expect((saved.qualityReports?.[0]?.report as ApprovalAwareQualityReport).approvalReadiness)
        .toEqual((saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness);
    });
  });

  describe("P1 · a cache hit reuses artefacts, never the verdict", () => {
    it("recomputes the aggregate from the stored snapshots without any network call", async () => {
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const item = content({ document, quality: { ...standardQuality(document), approvalReadiness: staleAggregate() } });
      const request = forbiddenFetcher();

      const result = await new BaseApprovalReadinessApplicationService(
        request,
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });

      expect(request).not.toHaveBeenCalled();
      const report = (result.quality as ApprovalAwareQualityReport).approvalReadiness;
      expect(check(report, "site_readiness").status).toBe("passed");
      expect(report?.applicationReady).toBe(true);
      expect(result.inspectionPerformed).toBe(true);
    });

  });

  describe("P3 · an outdated inspection contract stops claiming ready", () => {
    it("downgrades snapshot-backed passes and says to re-run when the stored version is old", () => {
      // Reproduces approval-live-msczog4z, still carrying version "3.0" while
      // its stored aggregate advertised a verdict under today's contract.
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), "3.0") });

      const report = deriveApprovalReadinessReport({
        document,
        opportunity: noMandatoryEvidenceOpportunity,
        standardQualityApproved: true,
      });

      expect(report?.applicationReady).toBe(false);
      expect(check(report, "site_readiness").status).toBe("needs_review");
      expect(check(report, "site_readiness").action).toContain("승인 준비 검사를 다시 실행");
      expect(check(report, "duplicate").status).toBe("needs_review");
      // Text-derived checks are recomputed on every read, so contract age never
      // touches them.
      expect(check(report, "standard_quality").status).toBe("passed");
      expect(check(report, "approval_policy").status).toBe("passed");
      // An inapplicable check keeps its own state.
      expect(check(report, "evidence").status).toBe("passed");
      expect(check(report, "evidence").applicable).toBe(false);
    });

    it("keeps today's verdict when the stored inspection version is current", () => {
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });

      const report = deriveApprovalReadinessReport({
        document,
        opportunity: noMandatoryEvidenceOpportunity,
        standardQualityApproved: true,
      });

      expect(report?.applicationReady).toBe(true);
      expect(check(report, "site_readiness").status).toBe("passed");
    });

    it("re-inspects rather than reusing artefacts gathered under an old contract", async () => {
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), "3.0") });
      const item = content({ document, quality: standardQuality(document) });
      const request = liveFetcher();

      const result = await new BaseApprovalReadinessApplicationService(
        request,
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });

      expect(request).toHaveBeenCalled();
      expect(result.document.metadata?.approvalReadinessExecution?.version).toBe(approvalReadinessInspectionVersion);
    });
  });

  describe("P5 · a blocked Standard Quality reports the other five states", () => {
    it("returns a full six-check report instead of throwing, and explains the unevaluated ones", async () => {
      // Standard Quality is blocked, but independent Evidence/site checks must
      // still inspect the current manuscript revision.
      const source = baseDocument();
      const metadata = { ...source.metadata! };
      delete metadata.siteApprovalReadiness;
      const document: ContentDocument = { ...source, metadata };
      const item = content({ document, quality: standardQuality(document, false) });
      const request = forbiddenFetcher();

      const result = await new ApprovalReadinessApplicationService(
        request,
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });

      expect(request).toHaveBeenCalled();
      const report = (result.quality as ApprovalAwareQualityReport).approvalReadiness;
      expect(report?.checks).toHaveLength(6);
      expect(check(report, "standard_quality").status).toBe("blocked");
      expect(check(report, "site_readiness").status).not.toBe("not_evaluated");
      // Standard Quality must not decide the other states: a duplicate check
      // that really passed still reads as passed.
      expect(check(report, "duplicate").status).toBe("passed");
      expect(result.inspectionPerformed).toBe(true);
    });

    it("returns the same aggregate the persistence boundary will store", async () => {
      // The API used to be able to return one answer while the store saved
      // another, because the two derived the aggregate differently.
      const document = baseDocument();
      const item = content({ document, quality: standardQuality(document, false) });

      const result = await new ApprovalReadinessApplicationService(
        forbiddenFetcher(),
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });
      const saved = applyApprovalPersistencePolicy(userData(item), result.data);

      expect((saved.contents[0]?.quality as ApprovalAwareQualityReport).approvalReadiness)
        .toEqual((result.quality as ApprovalAwareQualityReport).approvalReadiness);
    });

    it("records a completed inspection identity even when Standard Quality is blocked", async () => {
      const document = baseDocument();
      const item = content({ document, quality: standardQuality(document, false) });

      const result = await new ApprovalReadinessApplicationService(
        forbiddenFetcher(),
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });

      expect(result.document.metadata?.approvalReadinessExecution?.status).toBe("completed");
    });

    it("replaces a verdict left over from a superseded revision and names that as the cause", async () => {
      // The stored aggregate still claims Standard Quality passed, but the
      // manuscript has been edited since that review.
      const document = baseDocument({ approvalReadinessExecution: storedExecution(baseDocument(), approvalReadinessInspectionVersion) });
      const editedQuality = { ...standardQuality(document), reviewedRevisionId: "rev-superseded", approvalReadiness: staleAggregate() };
      const item = content({ document, quality: editedQuality });

      const result = await new ApprovalReadinessApplicationService(
        forbiddenFetcher(),
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection });

      const report = (result.quality as ApprovalAwareQualityReport).approvalReadiness;
      expect(check(report, "standard_quality").status).toBe("blocked");
      expect(check(report, "standard_quality").message).toContain("원고가 수정되어");
      expect(check(report, "standard_quality").action).toContain("품질 검토를 다시 실행");
      expect(report?.applicationReady).toBe(false);
    });

    it("still refuses when no quality report exists at all", async () => {
      const document = baseDocument();
      const item = content({ document });

      await expect(new ApprovalReadinessApplicationService(
        forbiddenFetcher(),
        () => "2026-08-13T00:00:00.000Z",
      ).execute({ data: userData(item), contentId: "content-1", connection }))
        .rejects.toThrow("원고 품질 검토를 실행해야 합니다");
    });
  });

  describe("P6 · re-running the check does not re-date verified sources", () => {
    const sourceUrl = "https://www.moma.org/collection/works/79802";
    const sourceHtml = `<!doctype html><html><head><title>The Starry Night | MoMA</title><meta property="og:site_name" content="The Museum of Modern Art"></head><body>${"The Starry Night was created in 1889 and is held by The Museum of Modern Art. Museum collection record. ".repeat(8)}</body></html>`;

    /**
     * Every provenance class that survives canonicalization. The bug reproduced
     * differently per class because `canonicalSources` re-derives `cited` and
     * `selected` from provenance while the Core selection rule that writes
     * stored packs treats `system_verified` and `document_link` as selected
     * too. `system_verified` is the shape of the real stored WordPress approval
     * article content-mscjq0sq-xd8kp5.
     */
    const provenances = ["citation", "user_selected", "document_link", "system_verified"] as const;

    function verifiableDocument(provenance: (typeof provenances)[number]): ContentDocument {
      const source = baseDocument();
      return {
        ...source,
        metadata: {
          ...source.metadata!,
          approvalEvidence: {
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
              provenance,
              cited: provenance === "citation",
              // Matches how the Core selection rule marks a stored source,
              // not how canonicalSources re-derives it from provenance.
              selected: true,
              linkedBlockIds: ["p1"],
              facts: [{ field: "citedContext", value: "공식 페이지 후보" }],
            }],
          },
        },
        blocks: [
          ...source.blocks,
          { id: "p1", type: "paragraph", text: `작품명: The Starry Night\n제작연도: 1889년\n소장처: The Museum of Modern Art\n공식 페이지: ${sourceUrl}` },
        ],
      };
    }

    function sourceFetcher() {
      return vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "HEAD") return new Response("", { status: 200 });
        if (url === sourceUrl) return new Response(sourceHtml, { status: 200, headers: { "content-type": "text/html" } });
        return new Response(siteHtml, { status: 200, headers: { "content-type": "text/html" } });
      });
    }

    /** One press of 승인 준비 검사 실행, including the route's normalization and the save. */
    async function press(data: UserData, now: string) {
      const request = sourceFetcher();
      const normalized = normalizeApprovalEvidenceCandidates(data, "content-1");
      const result = await new ApprovalReadinessApplicationService(request, () => now)
        .execute({ data: normalized, contentId: "content-1", connection });
      return { request, result, saved: applyApprovalPersistencePolicy(data, result.data) };
    }

    for (const provenance of provenances) {
      it(`reuses the stored verification on later presses instead of re-dating it (${provenance})`, async () => {
        const document = verifiableDocument(provenance);
        const first = await press(userData(content({ document, quality: standardQuality(document), opportunity: undefined })), "2026-07-27T10:30:00.000Z");
        expect(first.result.evidence.pack.status).toBe("verified");
        expect(first.result.document.blocks).toContainEqual(expect.objectContaining({
          id: "approval-review-date",
          text: "출처 확인일: 2026-07-27",
        }));
        const projectedFirst = first.result.document.blocks
          .filter((block) => (block as { ownership?: string }).ownership === "system_source_projection").length;
        expect(projectedFirst).toBeGreaterThan(0);

        // Three presses, because the original defect reproduced on every one.
        const second = await press(first.saved, "2026-09-01T10:30:00.000Z");
        const third = await press(second.saved, "2026-11-11T10:30:00.000Z");

        for (const [label, run] of [["second", second], ["third", third]] as const) {
          expect(run.request.mock.calls.some(([input]) => String(input) === sourceUrl), `${label} press re-fetched the source`).toBe(false);
          expect(run.result.document.metadata?.approvalEvidence?.reviewedAt, `${label} press moved reviewedAt`)
            .toBe("2026-07-27T10:30:00.000Z");
          expect(run.result.document.metadata?.approvalReadinessExecution, `${label} press dropped the inspection record`)
            .toBeDefined();
          expect(run.result.document.blocks.filter((block) =>
            (block as { ownership?: string }).ownership === "system_source_projection").length, `${label} press dropped the source section`)
            .toBe(projectedFirst);
          expect(run.result.document.blocks).toContainEqual(expect.objectContaining({
            id: "approval-review-date",
            text: "출처 확인일: 2026-07-27",
          }));
        }
      });
    }

    it("still re-verifies when the article's source set actually changes", async () => {
      const document = verifiableDocument("citation");
      const first = await press(userData(content({ document, quality: standardQuality(document), opportunity: undefined })), "2026-07-27T10:30:00.000Z");

      const stored = first.saved.contents[0]!;
      const withExtraSource: UserData = {
        ...first.saved,
        contents: [{
          ...stored,
          document: {
            ...stored.document!,
            metadata: {
              ...stored.document!.metadata!,
              approvalEvidence: {
                ...stored.document!.metadata!.approvalEvidence!,
                sources: [
                  ...stored.document!.metadata!.approvalEvidence!.sources,
                  {
                    sourceId: "museum-2",
                    url: "https://www.moma.org/collection/works/00000",
                    title: "다른 작품",
                    publisher: "www.moma.org",
                    sourceType: "official_institution" as const,
                    retrievedAt: "2026-07-27T00:00:00.000Z",
                    verified: false,
                    provenance: "user_selected" as const,
                    selected: true,
                    facts: [{ field: "citedContext", value: "사용자 추가 출처" }],
                  },
                ],
              },
            },
          },
        }],
      };

      const second = await press(withExtraSource, "2026-09-01T10:30:00.000Z");

      expect(second.request).toHaveBeenCalled();
      expect(second.result.document.metadata?.approvalEvidence?.reviewedAt).toBe("2026-09-01T10:30:00.000Z");
    });
  });

  describe("P4 · the Evidence action names the failing Claim", () => {
    it("reports the uncovered Claim fields and the rejected sources", () => {
      const document = baseDocument({
        approvalEvidence: {
          version: "1.0",
          status: "needs_review",
          coverageStatus: "needs_review",
          unverifiedFactFields: ["genericClaim:cdusyk"],
          sources: [{
            sourceId: "law-1",
            url: "https://law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1031805825",
            title: "조문정보",
            publisher: "국가법령정보센터",
            sourceType: "official_law",
            retrievedAt: "2026-07-27T00:00:00.000Z",
            verified: false,
            provenance: "system_verified",
            verificationStatus: "fact_mismatch",
            failureReason: "저장된 사실과 원고 문장이 일치하지 않습니다.",
            facts: [{ field: "citedContext", value: "조문" }],
          }],
        },
      });

      const report = deriveApprovalReadinessReport({
        document,
        opportunity: { requiredEvidenceContract: {
          schemaVersion: 1,
          contractId: "contract-1",
          policyId: "adsense_approval_mode",
          policyVersion: "1.0",
          profileId: "tistory_vivarain_art_v1",
          profileVersion: "1.0",
          profileSourceRequirementApplicable: true,
          explicitVerificationRequired: true,
          sourceRequirements: [],
          requiredClaims: [],
        } } as unknown as NonNullable<UserContent["opportunity"]>,
        standardQualityApproved: true,
      });

      const evidence = check(report, "evidence");
      expect(evidence.status).toBe("needs_review");
      expect(evidence.action).toContain("genericClaim:cdusyk");
      expect(evidence.action).toContain("국가법령정보센터");
      expect(evidence.action).toContain("저장된 사실과 원고 문장이 일치하지 않습니다.");
    });
  });
});
