import type { ContentDocument } from "./ContentDocument";

export interface ContentRenderer<Output> {
  render(document: ContentDocument): Promise<Output>;
}
