import type { ContentSummary } from "../view-models/content";

export const contentSummaryFixtures: readonly ContentSummary[] = [
  { id: "content-workflow-map", projectId: "content-operations", title: "A practical content workflow map", status: "published", updatedAt: "Today" },
  { id: "content-quality-checklist", projectId: "content-operations", title: "Quality review checklist", status: "in-review", updatedAt: "Yesterday" },
  { id: "content-publishing-rhythm", projectId: "content-operations", title: "Building a sustainable publishing rhythm", status: "draft", updatedAt: "3 days ago" },
  { id: "editorial-principles", projectId: "editorial-system", title: "Editorial principles that scale", status: "ready", updatedAt: "Yesterday" },
  { id: "review-guide", projectId: "editorial-system", title: "A focused review guide", status: "draft", updatedAt: "4 days ago" },
  { id: "healthy-morning", projectId: "healthy-habits", title: "A healthier morning routine", status: "published", updatedAt: "2 days ago" },
  { id: "healthy-walking", projectId: "healthy-habits", title: "Making daily walks easier", status: "draft", updatedAt: "5 days ago" },
] as const;
