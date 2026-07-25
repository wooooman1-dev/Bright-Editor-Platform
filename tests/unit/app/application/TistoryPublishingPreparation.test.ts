import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("node:fs/promises", () => ({ access: mocks.access }));

import { applyTistoryPublishingAccount, applyTistoryPublishingCategory, calculateTistoryReadiness, resolveTistoryDefaultCategory, usableTistoryConnections } from "../../../../app/application/publishing/TistoryPublishingPreparation";
import { QualityEngine } from "../../../../core/quality";
import { safeDraftPermissions, type PlatformConnection } from "../../../../core/connections";
import { determineContentPlanQualityTarget, type ContentDocument } from "../../../../core/content";
import type { UserData } from "../../../../app/user-flow/user-data";

const qualityTarget = determineContentPlanQualityTarget({
  contentType: "article",
  readerProblem: "현재 상태에 맞는 건강운동 방법을 안전하게 선택하기 어려움",
  requiredContentElements: ["운동 전 배경과 원인", "현재 상태 판단 기준", "안전한 실행 방법", "주의할 예외와 다음 행동"],
});
const document: ContentDocument = {
  id: "content",
  title: "건강운동 방법을 안전하게 시작하는 실천 가이드",
  metadata: {
    buttonCount: 4, createdAt: "now", generator: "test", imageCount: 1, language: "ko", readingTime: 3,
    source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 500,
    metaDescription: "건강운동 방법을 시작하기 전에 확인할 배경과 판단 기준, 안전한 실행 순서, 주의할 예외와 다음 행동을 구체적으로 안내합니다.",
    primarySearchIntent: "건강운동 방법",
    tags: ["건강운동", "운동방법", "안전운동", "운동순서", "건강관리"],
    qualityTarget,
    longFormStructure: {
      introductionBlockIds: ["intro"],
      sections: [
        { headingBlockId: "h1", paragraphBlockIds: ["p1"], sectionType: "explanation" },
        { headingBlockId: "h2", paragraphBlockIds: ["p2"], sectionType: "explanation" },
        { headingBlockId: "h3", paragraphBlockIds: ["p3"], sectionType: "steps" },
        { headingBlockId: "h4", paragraphBlockIds: ["p4"], sectionType: "warning" },
      ],
      conclusionBlockIds: ["conclusion"],
    },
  },
  blocks: [
    { id: "intro", type: "paragraph", text: "건강운동 방법은 현재 상태를 확인한 뒤 무리하지 않는 동작부터 시작하는 것입니다. 이 글은 안전한 선택 기준과 실행 흐름을 직접 안내합니다." },
    { id: "h1", type: "heading", level: 2, text: "건강운동 방법을 시작하는 배경" },
    { id: "p1", type: "paragraph", text: "운동 전 컨디션은 계획에 영향을 줍니다. 통증이나 피로가 있으면 원인을 먼저 살펴야 합니다. 시작 조건을 구분하면 무리한 선택을 피할 수 있습니다." },
    { id: "h2", type: "heading", level: 2, text: "현재 상태를 판단하는 기준" },
    { id: "p2", type: "paragraph", text: "판단 기준은 동작 중 불편함과 회복 상태입니다. 편안하게 움직일 수 있는지 확인합니다. 조건이 달라지면 강도를 조정합니다." },
    { id: "h3", type: "heading", level: 2, text: "안전하게 실행하는 순서" },
    { id: "p3", type: "paragraph", text: "먼저 가벼운 동작으로 몸 상태를 확인합니다. 다음으로 가능한 범위에서 실행 방법을 적용합니다. 중간에 불편함이 생기면 멈춥니다. 마지막으로 결과를 점검해 다음 단계를 선택합니다." },
    { id: "h4", type: "heading", level: 2, text: "주의할 예외와 중단 신호" },
    { id: "p4", type: "paragraph", text: "갑작스러운 통증은 주의해야 할 신호입니다. 평소와 다른 증상이 있으면 임의로 계속하지 않습니다. 필요한 경우 전문가에게 확인한 뒤 다음 행동을 정합니다." },
    { id: "image", type: "image", source: "", alt: "건강운동 방법의 안전한 실행 순서", prompt: "갑작스러운 통증과 평소와 다른 증상을 확인하고 운동을 중단한 뒤 전문가에게 확인하는 안전 절차 인포그래픽" },
    { id: "internal", type: "button", purpose: "internal_link", label: "건강 기록", targetUrl: "https://bright-healthy.tistory.com/entry/health-log" },
    ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 건강 글 ${index + 1}`, targetUrl: `https://bright-healthy.tistory.com/entry/related-${index + 1}` })),
    { id: "conclusion", type: "paragraph", text: "건강운동 방법의 핵심은 현재 상태에 맞는 기준으로 시작하는 것입니다. 오늘은 안전 신호를 확인한 뒤 가능한 첫 동작을 선택하고, 예외가 있으면 전문가에게 확인합니다." },
  ],
};
const base: UserData = {
  workspace: { id: "workspace", name: "Studio", settings: { enabledPlatforms: ["tistory"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } } },
  brands: [],
  projects: [{ id: "project", workspaceId: "workspace", name: "건강운동", description: "", selectedPublishingAccountIds: [], strategy: { primaryTopic: "건강운동", subtopics: [], excludedTopics: [], defaultContentType: "article", defaultPlatform: "tistory", targetLength: "long", targetAudience: "reader", tone: "clear", internalLinkPolicy: "real", relatedPostPolicy: "real", ctaPolicy: "optional", imageStrategy: "placeholder", seoPolicy: "people-first" }, createdAt: "now", updatedAt: "now" }],
  contents: [{ id: "content", workspaceId: "workspace", projectId: "project", title: document.title, body: "", status: "draft", selectedPublishingAccountIds: [], contentType: "long-form blog article", primaryKeyword: "건강운동 방법", searchIntent: "건강운동 방법", document, updatedAt: "now" }],
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

  it("matches the Project topic to a Tistory category before generation and stores it as the default", () => {
    const category = resolveTistoryDefaultCategory(base.projects[0], connection.id, [
      { id: "1038988", name: "건강정보" },
      { id: "1057542", name: "건강운동" },
    ]);
    expect(category).toEqual({ id: "1057542", name: "건강운동" });
    const accountReady = applyTistoryPublishingAccount(base, "project", "content", connection.id, "later");
    const next = applyTistoryPublishingCategory(accountReady, "project", "content", connection.id, category!, "later");
    expect(next.projects[0].strategy?.defaultTistoryCategory).toEqual({ publishingAccountId: "account", id: "1057542", name: "건강운동" });
    expect(next.contents[0].publishingPreparation?.tistory).toMatchObject({ publishingAccountId: "account", platformCategoryId: "1057542", platformCategoryName: "건강운동" });
  });

  it("returns server readiness with only final confirmation remaining", async () => {
    let next = applyTistoryPublishingAccount(base, "project", "content", "account", "later");
    const quality = new QualityEngine().review(document, { contentType: "long-form blog article", platform: "tistory", primaryKeyword: "건강운동 방법", searchIntent: "건강운동 방법" });
    expect(quality.approved).toBe(true);
    expect(quality.approvalType).toBe("standard");
    next = { ...next, projects: next.projects.map((project) => ({ ...project, strategy: { ...project.strategy!, defaultTistoryCategory: { publishingAccountId: "account", id: "1057542", name: "건강운동" } } })), contents: next.contents.map((content) => ({ ...content, publishingPreparation: { tistory: { publishingAccountId: "account", platformCategoryId: "1057542", platformCategoryName: "건강운동", updatedAt: "later" } }, quality })) };
    const readiness = await calculateTistoryReadiness({ data: next, project: next.projects[0], content: next.contents[0], connection, selectedTarget: true, finalConfirmation: false, root: "root" });
    expect(readiness.ready).toBe(true);
    expect(readiness.checks.find((check) => check.key === "publishing_account")?.passed).toBe(true);
    expect(readiness.checks.find((check) => check.key === "category")?.message).toContain("건강운동");
    expect(readiness.checks.find((check) => check.key === "final_confirmation")?.passed).toBe(false);
  });
});
