import { describe, expect, it } from "vitest";

import {
  identifyWordPressSiteSnapshot,
  mergeWordPressManualReviewsAfterAudit,
  updateWordPressManualReview,
} from "../../../../apps/wordpress/approval/WordPressManualSiteReview";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";

const connection: PlatformConnection = {
  id: "wordpress-1",
  workspaceId: "workspace-1",
  platform: "wordpress",
  displayName: "WordPress",
  status: "connected",
  publicMetadata: { siteUrl: "https://brightjaetech.kr" },
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  lastVerifiedAt: "2026-07-30T00:00:00.000Z",
  selectedAsDefault: true,
  version: 1,
  automationPermissions: safeDraftPermissions,
};

const audited = {
  version: "1.0" as const,
  status: "needs_review" as const,
  checkedAt: "2026-07-30T00:00:00.000Z",
  checks: [
    { key: "homepage_noindex", passed: true, message: "noindex 없음" },
    { key: "theme_plugin_review", passed: false, message: "테마 검토 필요" },
  ],
};

describe("WordPress manual site review persistence", () => {
  it("binds manual state to the exact WordPress connection and site", () => {
    const identified = identifyWordPressSiteSnapshot(audited, connection);
    const completed = updateWordPressManualReview(
      identified,
      connection,
      "theme_plugin_review",
      true,
      "2026-07-30T01:00:00.000Z",
    );
    expect(completed.status).toBe("passed");
    expect(completed.checks.find((check) =>
      check.key === "theme_plugin_review")?.passed).toBe(true);
  });

  it("preserves a completed manual check across a fresh automatic audit", () => {
    const completed = updateWordPressManualReview(
      identifyWordPressSiteSnapshot(audited, connection),
      connection,
      "theme_plugin_review",
      true,
      "2026-07-30T01:00:00.000Z",
    );
    const merged = mergeWordPressManualReviewsAfterAudit(
      completed,
      { ...audited, checkedAt: "2026-07-30T02:00:00.000Z" },
      connection,
    );
    expect(merged.checks.find((check) =>
      check.key === "theme_plugin_review")?.passed).toBe(true);
    expect(merged.status).toBe("passed");
  });
});
