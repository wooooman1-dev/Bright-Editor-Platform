import type { ContentDocument } from "../../core/content";
import { WordPressHtmlRenderer } from "./WordPressHtmlRenderer";

export class WordPressDraftPublishingAdapter {
  constructor(private readonly renderer = new WordPressHtmlRenderer()) {}
  async saveDraft(input: Readonly<{ siteUrl: string; username: string; applicationPassword: string; content: ContentDocument }>) {
    const response = await fetch(`${input.siteUrl}/wp-json/wp/v2/posts`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${input.username}:${input.applicationPassword}`).toString("base64")}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: input.content.title, content: this.renderer.render(input.content), status: "draft" }) });
    if (!response.ok) throw new Error("WordPress draft could not be saved.");
    const result = await response.json() as { id: number; status: string; link?: string };
    if (result.status !== "draft") throw new Error("WordPress did not confirm draft status.");
    return Object.freeze({ externalId: String(result.id), status: "draft" as const });
  }
}
