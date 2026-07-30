import { describe, expect, it } from "vitest";

import {
  applyInternalLinkCatalogResult,
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
} from "../../../../../app/application/publishing/InternalLinkCatalogPolicy";

const document = {
  id: "content-1",
  title: "통장 쪼개기",
  blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "생활비 관리" }],
};

describe("platform-aware internal link catalog policy", () => {
  it("treats an evaluated empty WordPress public catalog as completed", () => {
    const result = applyInternalLinkCatalogResult(document, [], "evaluated");
    expect(result.metadata?.internalLinkCatalogStatus).toBe("evaluated");
    expect(result.metadata?.availableRelatedContentCandidates).toBe(0);
    expect(result.blocks).toEqual(document.blocks);
  });

  it("uses every selected WordPress category without inventing candidates", () => {
    const content = {
      id: "content-1",
      projectId: "project-1",
      title: "통장 쪼개기",
      body: "",
      status: "ready" as const,
      updatedAt: "2026-07-30T00:00:00.000Z",
      publishingPreparation: {
        wordpress: {
          publishingAccountId: "wordpress-1",
          categoryIds: ["12", "13"],
          categoryNames: ["생활경제", "정부지원"],
          updatedAt: "2026-07-30T00:00:00.000Z",
        },
      },
    };
    expect(publishingCategoryIdentities(content)).toEqual([
      { id: "12", name: "생활경제" },
      { id: "13", name: "정부지원" },
    ]);
    const ranked = rankPublishingPostCandidates(document, [{
      externalPostId: "20",
      title: "지원금 확인",
      publishedUrl: "https://brightjaetech.kr/support/",
      categoryId: "13",
      categoryName: "정부지원",
    }], content);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["20"]);
  });
});
