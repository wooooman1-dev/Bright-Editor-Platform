import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateApprovalReadiness } from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

function document(metadata: NonNullable<ContentDocument["metadata"]>): ContentDocument {
  return {
    id: "content-1",
    title: "승인 준비 원고",
    metadata,
    blocks: [{ id: "p", type: "paragraph", text: "독자에게 필요한 정보를 설명합니다." }],
  };
}

function metadata(): NonNullable<ContentDocument["metadata"]> {
  return {
    buttonCount: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "test",
    updatedAt: "2026-07-31T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 10,
  };
}

describe("platform-neutral approval readiness", () => {
  it("uses publishing-platform-neutral internal-link diagnostics", () => {
    const report = evaluateApprovalReadiness(document({
      ...metadata(),
      internalLinkCatalogStatus: "category_missing",
      availableRelatedContentCandidates: 0,
    }), [], true);
    const check = report.checks.find((item) => item.key === "internal_links");

    expect(check).toMatchObject({
      status: "blocked",
      message: expect.stringContaining("발행 카테고리"),
      action: expect.stringContaining("실제 발행 카테고리"),
    });
    expect(`${check?.message} ${check?.action}`).not.toMatch(/Tistory|티스토리/u);
  });

  it("does not let legacy manual checks block current automatic site readiness", () => {
    const report = evaluateApprovalReadiness(document({
      ...metadata(),
      siteApprovalReadiness: {
        version: "1.0",
        status: "needs_review",
        checkedAt: "2026-07-31T00:00:00.000Z",
        checks: [{
          key: "legacy_manual_review",
          passed: false,
          requirement: "manual",
          message: "과거 수동 검토 항목",
        }],
      },
    }), [], true);
    const check = report.checks.find((item) => item.key === "site_readiness");

    expect(check).toMatchObject({
      status: "passed",
      message: "사이트 자동 승인 준비 검사를 통과했습니다.",
    });
  });

  it("uses the selected platform context while preserving the existing Standard Quality review", () => {
    const source = readFileSync(join(
      process.cwd(),
      "app/application/approval/ApprovalReadinessApplicationService.ts",
    ), "utf8");
    const identitySource = readFileSync(join(
      process.cwd(),
      "app/application/approval/ApprovalReadinessExecutionIdentity.ts",
    ), "utf8");

    expect(identitySource).toContain('import { internalLinkCatalogContextKey } from "../publishing/InternalLinkCatalogPolicy";');
    expect(identitySource).toContain("internalLinkCatalogContextKey(content, connectionId)");
    expect(source).toContain("...content.quality");
    expect(source).not.toContain("new QualityEngine().review");
    expect(source).not.toContain('content.platform ?? "tistory"');
    expect(source).not.toContain("publishingPreparation?.tistory?.platformCategoryName");
  });

  it("uses the active content platform when legacy workspace platform settings are absent", () => {
    const source = readFileSync(join(
      process.cwd(),
      "app/user-flow/editor-publishing-platform.ts",
    ), "utf8");

    expect(source).toContain("?? (activePlatform ? [activePlatform] : [])");
    expect(source).not.toContain('?? ["tistory"]');
  });

  it("removes the user-controlled manual readiness action and checkbox UI", () => {
    const routeSource = readFileSync(join(process.cwd(), "app/api/approval/readiness/route.ts"), "utf8");
    const componentSource = readFileSync(join(process.cwd(), "app/user-flow/WordPressManualSiteReviewActions.tsx"), "utf8");

    expect(routeSource).not.toContain("set_wordpress_manual_site_review");
    expect(routeSource).not.toContain("WordPressManualSiteReviewApplicationService");
    expect(componentSource).not.toContain('type="checkbox"');
    expect(componentSource).toContain("return null");
  });
});
