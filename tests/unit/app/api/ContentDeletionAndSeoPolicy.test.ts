import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(join(process.cwd(), "app/api/studio/route.ts"), "utf8");

describe("Studio content deletion and SEO policy boundaries", () => {
  it("enforces the confirmed primary keyword across document-producing paths", () => {
    expect(routeSource).toContain("const initialDocument = ensureContentSeoPolicy(await placeAvailableTistoryPosts(owned, existing, result.document), existing);");
    expect(routeSource).toContain("placeDocument: async (document) => ensureContentSeoPolicy(await placeAvailableTistoryPosts(owned, existing, document), existing)");
    expect(routeSource).toContain("const document = ensureContentSeoPolicy(parsed, current);");
    expect(routeSource.match(/document = ensureContentSeoPolicy\(await placeAvailableTistoryPosts\(data, content, document\), content\);/gu)?.length).toBeGreaterThanOrEqual(3);
  });

  it("normalizes and persists the title before Quality Review scoring", () => {
    expect(routeSource).toContain("const document = ensureContentSeoPolicy(await placeAvailableTistoryPosts(data, content, content.document), content);");
    expect(routeSource).toContain("contentRevisionId(document) === contentRevisionId(content.document) ? data : applyCanonicalDocument");
    expect(routeSource).toContain("return NextResponse.json({ document, quality, data: persisted });");
  });

  it("exposes impact and backup-first content deletion actions", () => {
    expect(routeSource).toContain('body.action === "content-deletion-impact"');
    expect(routeSource).toContain('body.action === "delete-content"');
    expect(routeSource).toContain("new ContentDeletionService().delete(data");
    expect(routeSource).toContain("await studioStore.set(collection, stateId, result.data)");
  });
});
