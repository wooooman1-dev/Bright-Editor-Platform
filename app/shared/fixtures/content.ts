import type { ContentSummary } from "../view-models/content";

export const contentSummaryFixtures: readonly ContentSummary[] = [
  { id: "content-workflow-map", projectId: "content-operations", title: "실용적인 콘텐츠 작업 흐름", status: "published", updatedAt: "오늘" },
  { id: "content-quality-checklist", projectId: "content-operations", title: "콘텐츠 품질 검토 목록", status: "in-review", updatedAt: "어제" },
  { id: "content-publishing-rhythm", projectId: "content-operations", title: "지속 가능한 발행 주기 만들기", status: "draft", updatedAt: "3일 전" },
  { id: "editorial-principles", projectId: "editorial-system", title: "확장 가능한 편집 원칙", status: "ready", updatedAt: "어제" },
  { id: "review-guide", projectId: "editorial-system", title: "집중도 높은 검토 가이드", status: "draft", updatedAt: "4일 전" },
  { id: "healthy-morning", projectId: "healthy-habits", title: "더 건강한 아침 습관", status: "published", updatedAt: "2일 전" },
  { id: "healthy-walking", projectId: "healthy-habits", title: "매일 걷기를 쉽게 만드는 방법", status: "draft", updatedAt: "5일 전" },
] as const;
