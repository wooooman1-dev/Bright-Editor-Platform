import { describe, expect, it, vi } from "vitest";

import { saveTistoryDraft, TistoryHtmlRenderer, TistoryPublishingAdapter } from "../../../../../apps/tistory";
import type { ContentDocument } from "../../../../../core/content";

const document: ContentDocument = { id: "content-1", title: "Title", blocks: [
  { id: "h", level: 1, text: "A & B", type: "heading" },
  { alt: "Useful image", id: "i", source: "/image.png", type: "image" },
  { id: "c", label: "Continue", targetUrl: "/next", type: "button" },
] };

describe("Tistory publishing integration", () => {
  it("renders safe Tistory HTML including ALT and CTA", () => {
    const html = new TistoryHtmlRenderer().render(document);
    expect(html).toContain("A &amp; B");
    expect(html).toContain('alt="Useful image"');
    expect(html).toContain('class="bright-cta"');
  });

  it("prepares a draft-save command without public publishing", async () => {
    const prepared = await new TistoryPublishingAdapter().prepare({ content: document, platform: "tistory" });
    expect(prepared.payload).toMatchObject({ title: "Title", type: "save-draft" });
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
});
