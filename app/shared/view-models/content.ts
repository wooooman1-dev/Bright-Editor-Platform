export type ContentStatus = "draft" | "in-review" | "ready" | "published";

export type ContentSummary = Readonly<{
  id: string;
  projectId: string;
  title: string;
  status: ContentStatus;
  updatedAt: string;
}>;
