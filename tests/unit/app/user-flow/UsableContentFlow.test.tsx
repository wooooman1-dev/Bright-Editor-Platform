import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ContentCreationFlow } from "../../../../app/user-flow/ContentCreationFlow";
import { EditorWorkspace } from "../../../../app/user-flow/EditorWorkspace";
import { applyCanonicalDocument, createContentFromPlan, createProject, createWorkspace, emptyUserData, updateContent } from "../../../../app/user-flow/user-data";
import { QualityEngine } from "../../../../core/quality";

const workspace = createWorkspace(emptyUserData, "Studio", "w");
const projectData = createProject(workspace, { id: "p", name: "Project", brandIdFactory: () => "b", now: "now" });
const project = projectData.projects[0];
const plan = { interpretedIntent: "Intent", domain: "health", targetAudience: "reader", contentGoal: "help", recommendedPrimaryKeyword: "keyword", keywordCandidates: ["keyword"], searchIntent: "informational", recommendedContentType: "article", recommendedPlatforms: ["tistory"], suggestedTitleAngles: ["Title"], relatedKeywords: [], contentCluster: [], recommendationReason: "reason", confidence: 0.8, estimateDisclosure: "AI estimates" } as const;
const contentData = createContentFromPlan(projectData, { id: "c", projectId: "p", naturalLanguageRequest: "request", plan, primaryKeyword: "keyword", selectedPublishingAccountIds: [], now: "now" });

describe("usable Content flow UI", () => {
  it("starts with a natural-language question and manual fallback", () => {
    const html = renderToStaticMarkup(<ContentCreationFlow data={projectData} project={project} onBack={vi.fn()} onOpenEditor={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain("어떤 콘텐츠를 만들까요?"); expect(html).toContain("직접 설정하기");
    expect(html).toContain('/workspaces/w/settings?section=connections');
    expect(html).toContain("AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다");
  });
  it("renders editor, quality review, exact preview controls, and isolated iframe path", () => {
    const document = { id: "c", title: "건강 가이드", blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "시작" }, { id: "p", type: "paragraph" as const, text: "건강 관리 방법을 설명할 예정입니다." }] };
    let reviewed = applyCanonicalDocument(contentData, "c", document, "generation", "now");
    const quality = new QualityEngine().review(document, { contentType: "article", platform: "tistory", primaryKeyword: "건강", searchIntent: "건강 관리", reviewedAt: "2026-01-01T00:00:00.000Z" });
    reviewed = updateContent(reviewed, "c", { quality });
    const html = renderToStaticMarkup(<EditorWorkspace content={reviewed.contents[0]} data={reviewed} project={project} onBack={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain("품질 검토"); expect(html).toContain("검색 의도"); expect(html).toContain("정보 완성도"); expect(html).toContain("글자 수"); expect(html).toContain("티스토리 미리보기"); expect(html).toContain("HTML 보기"); expect(html).not.toContain("원본 HTML"); expect(html).toContain("원고"); expect(html).toContain("문서 구조 보기"); expect(html).toContain("끌어서 H2 이동"); expect(html).toContain("위로 이동"); expect(html).toContain("CTA 추가"); expect(html).toContain("수익 링크 추가"); expect(html).toContain("자동 추천 변경"); expect(html).toContain("AI 개선안 만들기"); expect(html).toContain("Tistory 임시저장"); expect(html).toContain("Tistory 카테고리"); expect(html).toContain("품질 승인은 현재 Revision이 기준을 통과하면 자동 완료됩니다.");
  });
  it("does not duplicate a Content record when the same confirmed id retries", () => {
    const retried = createContentFromPlan(contentData, { id: "c", projectId: "p", naturalLanguageRequest: "request", plan, primaryKeyword: "keyword", selectedPublishingAccountIds: [], now: "later" });
    expect(retried.contents).toHaveLength(1);
  });
  it.each([
    ["legacy", { score: 100, seoReady: true, readabilityReady: true }],
    ["undefined dimensions", { dimensions: undefined }],
    ["null dimensions", { dimensions: null }],
    ["invalid dimensions", { dimensions: "invalid" }],
  ])("opens the complete Editor for %s Quality data", (_label, legacyQuality) => {
    const legacy = updateContent(contentData, "c", { quality: legacyQuality as never });
    const html = renderToStaticMarkup(<EditorWorkspace content={legacy.contents[0]} data={legacy} project={project} onBack={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain("편집기");
    expect(html).toContain("재검토 필요");
    expect(html).not.toContain("<strong>100</strong>");
  });
  it("shows the unreviewed state for a new document", () => {
    const html = renderToStaticMarkup(<EditorWorkspace content={contentData.contents[0]} data={contentData} project={project} onBack={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain("아직 현재 문서 버전에 대한 품질 검토가 없습니다.");
    expect(html).toContain("품질 검토를 실행하면 세부 점수가 표시됩니다.");
  });
  it("shows a stale message instead of trusting an old approved revision", () => {
    const original = { id: "c", title: "원본", blocks: [{ id: "p", type: "paragraph" as const, text: "원본 본문" }] };
    const report = new QualityEngine().review(original, { contentType: "article", platform: "tistory", primaryKeyword: "원본", searchIntent: "원본" });
    const changed = { ...original, blocks: [{ id: "p", type: "paragraph" as const, text: "수정된 본문" }] };
    let stale = applyCanonicalDocument(contentData, "c", changed, "manual", "later");
    stale = updateContent(stale, "c", { quality: { ...report, approved: true } });
    const html = renderToStaticMarkup(<EditorWorkspace content={stale.contents[0]} data={stale} project={project} onBack={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain("문서가 수정되어 이전 품질 검토가 만료되었습니다.");
    expect(html).not.toContain("게시 준비 완료");
  });
  it("keeps the persisted category as a selected option before a category refresh succeeds", () => {
    const prepared = updateContent(contentData, "c", { publishingAccountId: "account", publishingPreparation: { tistory: { publishingAccountId: "account", platformCategoryId: "1038988", platformCategoryName: "건강정보", updatedAt: "now" } } });
    const html = renderToStaticMarkup(<EditorWorkspace content={prepared.contents[0]} data={prepared} project={project} onBack={vi.fn()} onPersist={vi.fn()} />);
    expect(html).toContain('value="1038988" selected=""');
    expect(html).toContain("건강정보 · 현재 적용됨");
    expect(html).toContain("카테고리 적용 완료: 건강정보");
    expect(html).not.toContain('value="__uncategorized__" selected=""');
  });
});
