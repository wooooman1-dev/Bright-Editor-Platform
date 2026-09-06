import { describe, expect, it } from "vitest";

import {
  internalLinkCatalogContextIsCurrent,
  internalLinkCatalogContextKey,
  publishingCategoryIdentities,
  withProjectDefaultPublishingCategories,
} from "../../../../app/application/publishing/InternalLinkCatalogPolicy";
import type { UserContent, UserProject } from "../../../../app/user-flow/user-data";

const accountId = "wordpress-connection-1";

function project(overrides: Partial<UserProject["strategy"]> = {}): UserProject {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "밝은재테크",
    description: "생활경제·재테크",
    selectedPublishingAccountIds: [accountId],
    createdAt: "now",
    updatedAt: "now",
    strategy: {
      primaryTopic: "밝은재테크",
      subtopics: [],
      excludedTopics: [],
      defaultContentType: "Google SEO 정보 콘텐츠",
      defaultPlatform: "wordpress",
      targetAudience: "일반 독자",
      tone: "친절한 설명",
      internalLinkPolicy: "본문 중간 실제 공개 글 1개 자동 배치",
      relatedPostPolicy: "문서 마지막 최대 3개",
      ctaPolicy: "최대 1~2개",
      imageStrategy: "placeholder",
      seoPolicy: "Helpful",
      defaultWordPressCategories: [
        { publishingAccountId: accountId, id: "2", name: "생활재테크" },
      ],
      ...overrides,
    },
  } as unknown as UserProject;
}

function content(overrides: Partial<UserContent> = {}): UserContent {
  return {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "글",
    status: "draft",
    createdAt: "now",
    updatedAt: "2026-08-11T12:00:00.000Z",
    platform: "wordpress",
    publishingAccountId: accountId,
    selectedPublishingAccountIds: [accountId],
    ...overrides,
  } as unknown as UserContent;
}

/**
 * A freshly generated article has no publishingPreparation, because that is
 * written by the publishing preparation flow. Internal link placement was
 * therefore skipped as `category_missing` on every new article, and the links
 * appeared only once the candidate list was refreshed later.
 */
describe("internal link category falls back to the Project default", () => {
  it("finds no category on a newly generated article without the fallback", () => {
    expect(publishingCategoryIdentities(content())).toEqual([]);
  });

  it("uses the category the Project already declares for that account", () => {
    const seeded = withProjectDefaultPublishingCategories(content(), project());

    expect(publishingCategoryIdentities(seeded)).toEqual([{ id: "2", name: "생활재테크" }]);
  });

  it("never overrides a category the publishing flow already prepared", () => {
    const prepared = content({
      publishingPreparation: {
        wordpress: {
          publishingAccountId: accountId,
          categoryIds: ["7"],
          categoryNames: ["직접 고른 카테고리"],
          updatedAt: "2026-08-11T12:30:00.000Z",
        },
      },
    } as unknown as Partial<UserContent>);

    expect(withProjectDefaultPublishingCategories(prepared, project())).toBe(prepared);
  });

  it("ignores a default belonging to another publishing account", () => {
    const other = project({
      defaultWordPressCategories: [
        { publishingAccountId: "another-connection", id: "9", name: "다른 블로그" },
      ],
    } as Partial<UserProject["strategy"]>);

    expect(publishingCategoryIdentities(withProjectDefaultPublishingCategories(content(), other)))
      .toEqual([]);
  });

  /**
   * Six places ask a content which category it publishes to, and two of them
   * only ever receive a content, never a Project. Resolving the default for
   * some callers and not others would make the catalog context key disagree
   * with itself, so the catalog would read as stale on every request and be
   * re-fetched. The default is therefore filled in once, on load.
   */
  it("keeps the catalog context consistent once the default is resolved", () => {
    const seeded = withProjectDefaultPublishingCategories(content(), project());
    const document = {
      id: "doc",
      title: "글",
      blocks: [],
      metadata: {
        internalLinkCatalogStatus: "evaluated",
        internalLinkCatalogContextKey: internalLinkCatalogContextKey(seeded),
      },
    } as unknown as Parameters<typeof internalLinkCatalogContextIsCurrent>[1];

    expect(internalLinkCatalogContextIsCurrent(seeded, document)).toBe(true);
    expect(internalLinkCatalogContextIsCurrent(content(), document)).toBe(false);
  });

  it("leaves the content alone when the Project declares no default", () => {
    const bare = project({ defaultWordPressCategories: undefined } as Partial<UserProject["strategy"]>);
    const source = content();

    expect(withProjectDefaultPublishingCategories(source, bare)).toBe(source);
  });
});
