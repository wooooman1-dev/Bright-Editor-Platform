import { describe, expect, it, vi } from "vitest";

import { saveTistoryDraft, TistoryHtmlRenderer, TistoryPublishingAdapter } from "../../../../../apps/tistory";
import type { ContentDocument } from "../../../../../core/content";

const document: ContentDocument = { id: "content-1", title: "Title", blocks: [
  { id: "h", level: 1, text: "A & B", type: "heading" },
  { id: "intro", text: "Introduction", type: "paragraph" },
  { id: "h2", level: 2, text: "실천 방법", type: "heading" },
  { id: "h3", level: 3, text: "실천 방법", type: "heading" },
  { alt: "Useful image", id: "i", source: "/image.png", type: "image" },
  { id: "c", label: "Continue", targetUrl: "/next", type: "button" },
] };

describe("Tistory publishing integration", () => {
  it("renders safe Tistory HTML including ALT and CTA", () => {
    const html = new TistoryHtmlRenderer().render(document);
    expect(html).toContain("A &amp; B");
    expect(html).toContain('alt="Useful image"');
    expect(html).toContain('class="bright-cta"');
    expect(html).toContain('class="bright-toc"');
    expect(html).toContain('href="#실천-방법"');
    expect(html).toContain('id="실천-방법-2"');
  });

  it("prepares a draft-save command without public publishing", async () => {
    const prepared = await new TistoryPublishingAdapter().prepare({ content: document, platform: "tistory" });
    expect(prepared.payload).toMatchObject({ title: "Title", type: "save-draft" });
  });

  it("renders verified related posts as one final section with safe targets", () => {
    const html = new TistoryHtmlRenderer().render({ ...document, blocks: [...document.blocks, { id: "related", type: "button", purpose: "related_post", label: "건강검진 전날 주의사항", targetUrl: "https://bright-health.tistory.com/entry/checkup", target: "_blank" }] });
    expect(html).toContain("함께 보면 좋은 글");
    expect(html).toContain('class="bright-related-posts"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html.indexOf("bright-related-posts")).toBeGreaterThan(html.indexOf("bright-cta"));
  });

  it("keeps each related-post title paired with its own verified public URL and omits incomplete entries", () => {
    const html = new TistoryHtmlRenderer().render({ ...document, blocks: [...document.blocks,
      { id: "related-a", type: "button", purpose: "related_post", label: "첫 번째 관련 글", targetUrl: "https://bright-health.tistory.com/entry/first", target: "_self", sourceExternalPostId: "first" },
      { id: "related-b", type: "button", purpose: "related_post", label: "두 번째 관련 글", targetUrl: "https://bright-health.tistory.com/entry/second", target: "_self", sourceExternalPostId: "second" },
      { id: "missing-title", type: "button", purpose: "related_post", label: "", targetUrl: "https://bright-health.tistory.com/entry/hidden", target: "_self" },
    ] });
    expect(html).toContain('<a href="https://bright-health.tistory.com/entry/first">첫 번째 관련 글</a>');
    expect(html).toContain('<a href="https://bright-health.tistory.com/entry/second">두 번째 관련 글</a>');
    expect(html).not.toContain("hidden");
  });

  it("executes title, HTML, and draft save through the editor boundary", async () => {
    const adapter = { prepare: vi.fn(), isReady: vi.fn().mockResolvedValue(true), setTitle: vi.fn(), setContent: vi.fn(), saveDraft: vi.fn(), insertImage: vi.fn(), insertVideo: vi.fn(), insertButton: vi.fn(), publish: vi.fn() };
    const result = await saveTistoryDraft(adapter, { html: "<p>Body</p>", title: "Title", type: "save-draft" });
    expect(result.status).toBe("partially_verified");
    expect(adapter.setContent).toHaveBeenCalledWith("<p>Body</p>");
    expect(adapter.saveDraft).toHaveBeenCalledOnce();
  });

  it("uses saved only after reliable post-save verification", async () => {
    const adapter = { prepare: vi.fn(), isReady: vi.fn().mockResolvedValue(true), setTitle: vi.fn(), setContent: vi.fn(), saveDraft: vi.fn(), insertImage: vi.fn(), insertVideo: vi.fn(), insertButton: vi.fn(), publish: vi.fn(), verifyDraft: vi.fn().mockResolvedValue({ saveClicked: true, saveNotificationDetected: true, draftIdDetected: true, draftListVerified: true, reopenedDraftVerified: true, titleMatched: true, bodyMatched: true, publicPostCreated: false }) };
    const result = await saveTistoryDraft(adapter, { html: "<p>Body</p>", title: "Title", type: "save-draft" });
    expect(result.status).toBe("saved");
    expect(result.publicPostCreated).toBe(false);
  });
  it("prevents false-positive success when the draft cannot be reopened", async () => {
    const adapter = { prepare: vi.fn(), isReady: vi.fn().mockResolvedValue(true), setTitle: vi.fn(), setContent: vi.fn(), saveDraft: vi.fn(), insertImage: vi.fn(), insertVideo: vi.fn(), insertButton: vi.fn(), publish: vi.fn(), verifyDraft: vi.fn().mockResolvedValue({ saveClicked: true, saveNotificationDetected: true, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: true, bodyMatched: true, publicPostCreated: false }) };
    const result = await saveTistoryDraft(adapter, { html: "<p>Body</p>", title: "Title", type: "save-draft" });
    expect(result.status).toBe("partially_verified");
  });
});
