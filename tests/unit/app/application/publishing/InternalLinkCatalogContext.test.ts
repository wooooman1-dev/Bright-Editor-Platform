import { describe, expect, it } from "vitest";

import {
  applyInternalLinkCatalogResult,
  publishingInternalLinkContextKey,
} from "../../../../../app/application/publishing/InternalLinkCatalogPolicy";
import type { ContentDocument, PublicPostCandidate } from "../../../../../core/content";
import type { UserContent } from "../../../../../app/user-flow/user-data";

const content: UserContent = {
  id: "content-1",
  workspaceId: "workspace-1",
  projectId: "project-1",
  title: "예금자보호 확인 방법",
  body: "",
  status: "ready",
  updatedAt: "2026-08-01T00:00:00.000Z",
  primaryKeyword: "예금자보호 확인 방법",
  publishingPreparation: {
    wordpress: {
      publishingAccountId: "wordpress-1",
      categoryIds: ["2"],
      categoryNames: ["생활경제"],
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  },
};

const candidate: PublicPostCandidate = {
  externalPostId: "20",
  title: "금융상품 설명서 확인 순서",
  publishedUrl: "https://brightjaetech.kr/product-guide/",
  categoryId: "2",
  categoryName: "생활경제",
};

describe("internal link publishing context", () => {
  it("removes stale automatic links, preserves manual links, and records the current context", () => {
    const document: ContentDocument = {
      id: "document-1",
      title: content.title,
      blocks: [
        { id: "p1", type: "paragraph", text: "금융상품 설명서를 확인하는 순서를 함께 살펴봅니다." },
        { id: "auto-related-post", type: "button", purpose: "related_post", label: "과거 자동 글", targetUrl: "https://example.com/old", target: "_self" },
        { id: "manual-related", type: "button", purpose: "related_post", label: "사용자 선택 글", targetUrl: "https://example.com/manual", target: "_self" },
      ],
    };
    const contextKey = publishingInternalLinkContextKey(content, "wordpress-1");
    const result = applyInternalLinkCatalogResult(document, [candidate], "evaluated", contextKey);

    expect(result.blocks.some((block) => block.id === "auto-related-post")).toBe(false);
    expect(result.blocks.some((block) => block.id === "manual-related")).toBe(true);
    expect(result.metadata?.internalLinkCatalogContextKey).toBe(contextKey);
    expect(result.metadata?.internalLinkCatalogStatus).toBe("evaluated");
  });
});
