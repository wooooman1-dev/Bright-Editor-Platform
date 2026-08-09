import { describe, expect, it } from "vitest";

import {
  resolveApprovalPolicySnapshot,
  type ApprovalReadinessReport,
} from "../../../../core/approval";
import {
  createContentOpportunityCandidate,
  type ContentDocument,
} from "../../../../core/content";
import {
  isApprovalApplicationReady,
  isStandardQualityApproved,
  QualityEngine,
  type QualityReport,
} from "../../../../core/quality";

const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;
const wordpressSnapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;

type ApprovalAwareReport = QualityReport & Readonly<{
  approvalReadiness?: ApprovalReadinessReport;
}>;

function document(text: string, approval = true): ContentDocument {
  return {
    id: "content-1",
    title: "비바레인 미술 감상 가이드",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-07-27T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 20,
      ...(approval ? { approvalPolicy: snapshot } : {}),
    },
    blocks: [
      { id: "h1", type: "heading", level: 2, text: "작품 감상 포인트" },
      { id: "p1", type: "paragraph", text },
    ],
  };
}

describe("approval preparation Quality policy", () => {
  it("keeps approval guarantee claims in the separate readiness report", () => {
    const text = "공식 소장처 자료를 확인했습니다. 이 글이면 애드센스 100% 승인을 보장합니다.";
    const approvalReport = new QualityEngine().review(document(text)) as ApprovalAwareReport;
    const standardReport = new QualityEngine().review(document(text, false));

    expect(approvalReport).toMatchObject({
      approved: standardReport.approved,
      approvalType: standardReport.approvalType,
      approvalState: standardReport.approvalState,
      overallScore: standardReport.overallScore,
    });
    expect(approvalReport.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "approval_policy",
      status: "blocked",
      action: expect.stringContaining("AdSense 승인 또는 통과를 보장"),
    }));
    expect(approvalReport.findings.some((finding) => finding.message.startsWith("[승인 준비 정책]"))).toBe(false);
  });

  it("keeps missing source requirements out of manuscript Quality tasks", () => {
    const report = new QualityEngine().review(document(
      "작품의 구도와 색채를 관찰하면 시선이 이동하는 순서를 이해할 수 있습니다.",
    )) as ApprovalAwareReport;

    expect(report.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "approval_policy",
      status: "passed",
    }));
    expect(report.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "not_evaluated",
    }));
    expect(report.tasks.some((task) => task.message.startsWith("[승인 준비 정책]"))).toBe(false);
  });

  it("does not let the WordPress profile create an information-date requirement for not-required Evidence", () => {
    const base = document("카드 명세서를 거래일, 금액, 거래처, 결제 방식 순서로 확인합니다.");
    const candidate = createContentOpportunityCandidate({
      sourceRequest: "카드 명세서 확인 방법",
      selectionMode: "automatic",
      selectedTopic: "신용카드 명세서 확인 순서",
      primaryKeyword: "신용카드 명세서 보는 방법",
      secondaryKeywords: ["카드 청구 내역 확인"],
      searchIntent: "카드 명세서를 확인하는 순서를 알고 싶다.",
      audience: "일반 카드 사용자",
      contentType: "guide",
      contentAngle: "날짜, 금액, 거래처, 결제 방식 확인 순서",
      readerProblem: "명세서의 어떤 항목부터 확인할지 모른다.",
      expectedCoverage: ["명세서 확인 순서"],
      selectionRationale: "일반적인 확인 절차를 안내한다.",
      opportunityEvidence: [],
      confidence: 0.8,
      cautions: [],
      projectId: "project-1",
      requiredEvidenceContract: {
        schemaVersion: 1,
        contractId: "contract-no-critical-claims",
        policyId: "adsense_approval_mode",
        policyVersion: "1.0",
        profileId: "wordpress_life_economy_v1",
        profileVersion: "1.0",
        profileSourceRequirementApplicable: false,
        explicitVerificationRequired: false,
        sourceRequirements: wordpressSnapshot.sourceRequirements,
        requiredClaims: [],
      },
    });
    const report = new QualityEngine().review({
      ...base,
      metadata: { ...base.metadata!, approvalPolicy: wordpressSnapshot },
    }, {
      opportunity: {
        ...candidate,
        workspaceId: "workspace-1",
        contentId: base.id,
        confirmedAt: "2026-08-09T00:00:00.000Z",
      },
    }) as ApprovalAwareReport;

    expect(report.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "approval_policy",
      status: "passed",
    }));
    expect(report.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "evidence",
      status: "passed",
      applicable: false,
    }));
    expect(report.tasks.some((task) => task.message.startsWith("[승인 준비 정책]"))).toBe(false);
  });

  it("does not apply approval readiness to standard content", () => {
    const report = new QualityEngine().review(document(
      "이 글이면 애드센스 100% 승인을 보장합니다.",
      false,
    ));

    expect(report).not.toHaveProperty("approvalReadiness");
    expect(report.findings.some((finding) => finding.message.startsWith("[승인 준비 정책]"))).toBe(false);
  });

  it("passes standard manuscript Quality while keeping application readiness blocked", () => {
    const report = {
      approved: true,
      approvalType: "standard" as const,
      approvalReadiness: {
        status: "needs_review" as const,
        applicationReady: false,
        checks: [],
      },
    };

    expect(isStandardQualityApproved(report)).toBe(true);
    expect(isApprovalApplicationReady(report)).toBe(false);
  });

  it("keeps Search Console, Analytics, indexing, and sitemap states outside manuscript Quality", () => {
    const base = document("핵심 답변과 적용 조건이 아직 충분하지 않은 짧은 원고입니다.");
    const withSiteState = (
      status: "passed" | "needs_review",
      passed: boolean,
    ): ContentDocument => ({
      ...base,
      metadata: {
        ...base.metadata!,
        siteApprovalReadiness: {
          version: "1.0",
          status,
          checkedAt: "2026-07-30T00:00:00.000Z",
          checks: [
            { key: "search_console", passed, message: "Search Console 사용자 확인 상태", requirement: "required" },
            { key: "google_analytics", passed, message: "Analytics 사용자 확인 상태", requirement: "required" },
            { key: "search_indexing", passed, message: "검색엔진 색인 상태", requirement: "required" },
            { key: "sitemap_submission", passed, message: "sitemap 제출 상태", requirement: "required" },
          ],
        },
      },
    });

    const withoutSiteState = new QualityEngine().review(base) as ApprovalAwareReport;
    const sitePassed = new QualityEngine().review(withSiteState("passed", true)) as ApprovalAwareReport;
    const siteNeedsReview = new QualityEngine().review(withSiteState("needs_review", false)) as ApprovalAwareReport;
    const manuscriptState = (report: ApprovalAwareReport) => ({
      approved: report.approved,
      approvalType: report.approvalType,
      approvalState: report.approvalState,
      overallScore: report.overallScore,
      dimensions: report.dimensions,
    });

    expect(withoutSiteState.approved).toBe(false);
    expect(manuscriptState(sitePassed)).toEqual(manuscriptState(withoutSiteState));
    expect(manuscriptState(siteNeedsReview)).toEqual(manuscriptState(withoutSiteState));
    expect(sitePassed.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "site_readiness",
      status: "passed",
    }));
    expect(siteNeedsReview.approvalReadiness?.checks).toContainEqual(expect.objectContaining({
      key: "site_readiness",
      status: "needs_review",
    }));
    expect(isStandardQualityApproved(sitePassed)).toBe(false);
    expect(isStandardQualityApproved(siteNeedsReview)).toBe(false);
  });
});
