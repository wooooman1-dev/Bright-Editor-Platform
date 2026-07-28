import { describe, expect, it } from "vitest";

import {
  resolveApprovalPolicySnapshot,
  type ApprovalReadinessReport,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";
import {
  isApprovalApplicationReady,
  isStandardQualityApproved,
  QualityEngine,
  type QualityReport,
} from "../../../../core/quality";

const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!;

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
      status: "blocked",
      action: expect.stringContaining("출처 또는 검토 기준 표시"),
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
});
