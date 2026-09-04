import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(join(process.cwd(), "app/api/studio/route.ts"), "utf8");

describe("Studio content deletion and SEO policy boundaries", () => {
  it("enforces the confirmed Opportunity before SEO placement across AI document paths", () => {
    expect(routeSource).toContain("const initialDocument = applyContentPolicy(await placeAvailablePublishingPosts(owned, existing, heroPreservedDocument), existing);");
    // 2026-09-04: generate 만 유일하게 restoreProtectedImageAssets(id 매칭)를
    // 안 불렀다 — 첫 생성 이미지는 id가 없어 id 매칭이 항상 실패해서 대표
    // 이미지가 두 장이 됐다. restoreProtectedHeroImage(역할 매칭)로 고쳤다.
    expect(routeSource).toContain("const heroPreservedDocument = existing.document\n        ? restoreProtectedHeroImage(existing.document, result.document)\n        : result.document;");
    expect(routeSource).toContain("placeDocument: async (document) => applyContentPolicy(await placeAvailablePublishingPosts(owned, existing, document), existing)");
    expect(routeSource).toContain("const document = applyContentPolicy(preserveCanonicalSeoMetadata(current.document, restoreProtectedImageAssets(current.document, parsed)), current, true);");
    expect(routeSource.match(/document = applyContentPolicy\(await placeAvailablePublishingPosts\(data, content, document\), content\);/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(routeSource).toContain("applyContentOpportunityPolicy(document, content.opportunity)");
  });

  it("keeps manual title edits intact during diagnostic Quality Review", () => {
    expect(routeSource).toContain("const document = await placeAvailablePublishingPosts(data, content, content.document);");
    expect(routeSource).not.toContain("ensureContentSeoPolicy(await placeAvailablePublishingPosts(data, content, content.document), content)");
    expect(routeSource).toContain("contentRevisionId(document) === contentRevisionId(content.document) ? data : applyCanonicalDocument");
    expect(routeSource).toContain("return NextResponse.json({ document, quality, data: saved });");
  });

  it("exposes impact and backup-first content deletion without requiring the title again", () => {
    expect(routeSource).toContain('body.action === "content-deletion-impact"');
    expect(routeSource).toContain('body.action === "delete-content"');
    expect(routeSource).toContain("new ContentDeletionService().delete(data");
    expect(routeSource).toContain("contentId: required(body.input?.contentId)");
    expect(routeSource).not.toContain("confirmationTitle: required(body.input?.confirmationTitle)");
    expect(routeSource).toContain("await studioStore.set(collection, stateId, result.data)");
  });
});
