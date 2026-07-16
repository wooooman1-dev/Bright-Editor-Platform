import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: mocks.access }));

import { applyTistoryPublishingAccount, calculateTistoryReadiness, usableTistoryConnections } from "../../../../app/application/publishing/TistoryPublishingPreparation";
import { QualityEngine } from "../../../../core/quality";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import type { UserData } from "../../../../app/user-flow/user-data";

const paragraph = "건강운동 방법을 찾는 독자가 바로 실천할 수 있도록 준비 순서와 확인 기준을 구체적으로 설명합니다. 기록을 비교하면 자신의 상황에 맞게 운동 강도와 시간을 안전하게 조정할 수 있습니다. ";
const document = { id: "content", title: "건강운동 방법 완전 가이드", metadata: { buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 5, source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1000, metaDescription: "건강운동 방법과 안전한 실천 순서를 구체적으로 안내합니다.", primarySearchIntent: "건강운동 방법" }, blocks: [
  { id: "intro", type: "paragraph" as const, text: paragraph.repeat(3) },
  ...Array.from({ length: 5 }, (_, index) => [{ id: `h-${index}`, type: "heading" as const, level: 2 as const, text: `건강운동 실천 단계 ${index + 1}` }, ...Array.from({ length: 3 }, (_, paragraphIndex) => ({ id: `p-${index}-${paragraphIndex}`, type: "paragraph" as const, text: paragraph.repeat(3) }))]).flat(),
  { id: "image", type: "image" as const, source: "", alt: "건강운동 단계별 자세와 안전 기준" },
  { id: "internal", type: "button" as const, purpose: "internal_link" as const, label: "건강 기록", targetUrl: "https://bright-healthy.tistory.com/entry/health-log" },
  ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 건강 글 ${index + 1}`, targetUrl: `https://bright-healthy.tistory.com/entry/related-${index + 1}` })),
  { id: "conclusion", type: "paragraph" as const, text: paragraph.repeat(3) },
] };
const base: UserData = {
  workspace: { id: "workspace", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [],
  projects: [{ id: "project", workspaceId: "workspace", name: "건강운동", description: "", selectedPublishingAccountIds: [], strategy: { primaryTopic: "건강운동", subtopics: [], excludedTopics: [], defaultContentType: "article", defaultPlatform: "tistory", targetLength: "long", targetAudience: "reader", tone: "clear", internalLinkPolicy: "real", relatedPostPolicy: "real", ctaPolicy: "optional", imageStrategy: "placeholder", seoPolicy: "people-first" }, createdAt: "now", updatedAt: "now" }],
  contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: document.title, body: "", status: "draft", selectedPublishingAccountIds: [], contentType: "long-form blog article", primaryKeyword: "건강운동", searchIntent: "건강운동 방법", document, updatedAt: "now" }],
};
const connection: PlatformConnection = { id: "account", workspaceId: "workspace", platform: "tistory", displayName: "bright-healthy", status: "connected", publicMetadata: { blogId: "bright-healthy", sessionStateAvailable: true }, createdAt: "now", updatedAt: "now", lastVerifiedAt: "now", selectedAsDefault: false, version: 1, automationPermissions: safeDraftPermissions, publishingPolicy: "review_first" };

describe("Tistory publishing preparation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(undefined); });

  it("accepts one verified Workspace account with a stored session and rejects cross-Workspace accounts", async () => {
    const other = { ...connection, id: "other", workspaceId: "other-workspace" };
    await expect(usableTistoryConnections(base, [connection, other], "root")).resolves.toEqual([connection]);
  });

  it("does not collapse multiple usable accounts into an arbitrary default", async () => {
    const second = { ...connection, id: "account-2" };
    const available = await usableTistoryConnections(base, [connection, second], "root");
    expect(available).toHaveLength(2);
  });

  it("stores the single account on Project strategy and Content publishing target", () => {
    const next = applyTistoryPublishingAccount(base, "project", "content", "account", "later");
    expect(next.projects[0]).toMatchObject({ selectedPublishingAccountIds: ["account"], strategy: { defaultPublishingAccountId: "account" } });
    expect(next.contents[0]).toMatchObject({ platform: "tistory", publishingAccountId: "account", selectedPublishingAccountIds: ["account"] });
  });

  it("returns server readiness with only final confirmation remaining", async () => {
    let next = applyTistoryPublishingAccount(base, "project", "content", "account", "later");
    const quality = new QualityEngine().review(document, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강운동", searchIntent: "건강운동 방법" });
    expect(quality.approved).toBe(true);
    next = { ...next, projects: next.projects.map((project) => ({ ...project, strategy: { ...project.strategy!, defaultTistoryCategory: { publishingAccountId: "account", id: "1057542", name: "건강운동" } } })), contents: next.contents.map((content) => ({ ...content, publishingPreparation: { tistory: { publishingAccountId: "account", platformCategoryId: "1057542", platformCategoryName: "건강운동", updatedAt: "later" } }, quality })) };
    const readiness = await calculateTistoryReadiness({ data: next, project: next.projects[0], content: next.contents[0], connection, selectedTarget: true, finalConfirmation: false, root: "root" });
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.find((check) => check.key === "publishing_account")?.passed).toBe(true);
    expect(readiness.checks.find((check) => check.key === "category")?.message).toContain("건강운동");
    expect(readiness.checks.find((check) => check.key === "final_confirmation")?.passed).toBe(false);
  });
});
