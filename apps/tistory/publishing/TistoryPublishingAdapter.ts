import type { PreparedPublication, PublicationRequest, PublicationResult, PublishingAdapter } from "../../../core/publishing";
import { TistoryHtmlRenderer } from "./TistoryHtmlRenderer";
import { runTistoryCategoryReadWorkflow, type TistoryCategoryResult } from "../workflows/TistoryCategoryReadWorkflow";
import { runTistoryPostReadWorkflow, type TistoryPostCatalogResult } from "../workflows/TistoryPostReadWorkflow";

export type TistoryDraftCommand = Readonly<{ html: string; title: string; type: "save-draft" }>;
export type TistoryPreparedPublication = PreparedPublication & Readonly<{ payload: TistoryDraftCommand }>;

export class TistoryPublishingAdapter implements PublishingAdapter {
  readonly platform = "tistory";
  constructor(private readonly renderer = new TistoryHtmlRenderer()) {}
  async prepare(request: PublicationRequest): Promise<TistoryPreparedPublication> {
    return Object.freeze({
      payload: Object.freeze({ html: this.renderer.render(request.content), title: request.content.title, type: "save-draft" as const }),
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
