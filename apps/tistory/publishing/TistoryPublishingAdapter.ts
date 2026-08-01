import type { PreparedPublication, PublicationRequest, PublicationResult, PublishingAdapter } from "../../../core/publishing";
import { deriveContentTags } from "../../../core/content";
import { evaluateHtmlIntegrity } from "../../../core/quality";
import { TistoryHtmlRenderer } from "./TistoryHtmlRenderer";
import { runTistoryCategoryReadWorkflow, type TistoryCategoryResult } from "../workflows/TistoryCategoryReadWorkflow";
import { runTistoryPostReadWorkflow, type TistoryPostCatalogResult } from "../workflows/TistoryPostReadWorkflow";

export type TistoryDraftCommand = Readonly<{ html: string; tags?: readonly string[]; title: string; type: "save-draft" }>;
export type TistoryPreparedPublication = PreparedPublication & Readonly<{ payload: TistoryDraftCommand }>;

export class TistoryPublishingAdapter implements PublishingAdapter {
  readonly platform = "tistory";
  constructor(private readonly renderer = new TistoryHtmlRenderer()) {}
  async prepare(request: PublicationRequest): Promise<TistoryPreparedPublication> {
    const html = this.renderer.render(request.content);
    const integrity = evaluateHtmlIntegrity(request.content, html);
    if (!integrity.passed) {
      throw new Error(`Tistory Draft HTML integrity blocked: ${integrity.issues.map((item) => item.code).join(", ")}.`);
    }
    return Object.freeze({
      payload: Object.freeze({ html, tags: deriveContentTags(request.content), title: request.content.title, type: "save-draft" as const }),
      platform: this.platform,
      request,
    });
  }
  async publish(publication: PreparedPublication): Promise<PublicationResult> {
    void publication;
    throw new Error("Public publishing is outside the Tistory draft-save scope.");
  }
  readCategories(input: Readonly<{ blogId: string; storageStatePath: string }>): Promise<TistoryCategoryResult> {
    return runTistoryCategoryReadWorkflow(input);
  }
  readPosts(input: Readonly<{ blogId: string; storageStatePath: string }>): Promise<TistoryPostCatalogResult> {
    return runTistoryPostReadWorkflow(input);
  }
}
