import type { ContentDocument } from "../content";

export type Workspace = Readonly<{ id: string; name: string }>;
export type Brand = Readonly<{ id: string; name: string; workspaceId: string }>;
export type Project = Readonly<{
  brandId?: string;
  description?: string;
  id: string;
  name: string;
  workspaceId: string;
  dataSourceConnectionIds?: readonly string[];
}>;
export type Content = Readonly<{
  document: ContentDocument;
  id: string;
  projectId: string;
  updatedAt: string;
}>;
export type Draft = Readonly<{
  contentId: string;
  document: ContentDocument;
  id: string;
  savedAt: string;
}>;
export type HistoryEntry = Readonly<{
  contentId: string;
  document: ContentDocument;
  id: string;
  recordedAt: string;
  version: number;
}>;
