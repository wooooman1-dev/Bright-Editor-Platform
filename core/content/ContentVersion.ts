import type { ContentDocument } from "./ContentDocument";

export type ContentVersion = Readonly<{
  content: ContentDocument;
  createdAt: string;
  documentId: string;
  id: string;
  version: number;
}>;
