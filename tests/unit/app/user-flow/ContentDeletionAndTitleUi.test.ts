import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync(join(process.cwd(), "app/user-flow/EditorWorkspace.tsx"), "utf8");
const titleSource = readFileSync(join(process.cwd(), "app/user-flow/ContentSeoTitleStatus.tsx"), "utf8");
const dangerSource = readFileSync(join(process.cwd(), "app/user-flow/ContentDangerZone.tsx"), "utf8");
const projectActionsSource = readFileSync(join(process.cwd(), "app/user-flow/ProjectCardActions.tsx"), "utf8");
const workspaceDangerSource = readFileSync(join(process.cwd(), "app/user-flow/DangerZone.tsx"), "utf8");

describe("Editor content title and deletion UX", () => {
  it("shows exact primary-keyword title status and one-click correction", () => {
    expect(editorSource).toContain("<ContentSeoTitleStatus");
    expect(editorSource).toContain("primaryKeyword={content.primaryKeyword}");
    expect(titleSource).toContain("대표 키워드가 SEO 제목에 없습니다.");
    expect(titleSource).toContain("SEO 제목 보정");
    expect(titleSource).toContain("buildReadableSeoTitle(currentTitle, keyword)");
    expect(editorSource).toContain("currentTitle={liveDocument?.metadata?.seoTitle ?? title}");
    expect(editorSource).toContain("metadata: Object.freeze({ ...liveDocument.metadata, seoTitle })");
    expect(editorSource).not.toContain("commitDocument({ ...liveDocument, title: seoTitle }");
  });

  it("synchronizes a server-corrected Quality Review document into the editor", () => {
    expect(editorSource).toContain("document?: ContentDocument; quality?: QualityReport; data?: UserData");
    expect(editorSource).toContain("await onPersist(response.data)");
    expect(editorSource).toContain("setDocumentDraft(response.document); setTitle(response.document.title)");
    expect(editorSource).toContain("대표 키워드를 포함하도록 제목을 보정하고 품질 검토를 완료했습니다.");
  });

  it("shows backup-first content deletion without exact-title confirmation", () => {
    expect(editorSource).toContain("<ContentDangerZone");
    expect(dangerSource).toContain("삭제 영향도");
    expect(dangerSource).toContain("외부 Tistory 글 삭제: 없음");
    expect(dangerSource).toContain("아래 버튼을 누르면 즉시 백업 후 삭제합니다.");
    expect(dangerSource).not.toContain("confirmationTitle");
    expect(dangerSource).not.toContain("제목을 정확히 입력");
    expect(dangerSource).toContain("백업 후 콘텐츠 삭제");
  });

  it("removes name re-entry from project and workspace deletion", () => {
    expect(projectActionsSource).toContain("삭제 영향을 확인하고 있습니다.");
    expect(projectActionsSource).toContain("백업 후 프로젝트 삭제");
    expect(projectActionsSource).not.toContain("삭제 확인 프로젝트 이름");
    expect(projectActionsSource).not.toContain("confirmation !== impact.name");
    expect(workspaceDangerSource).toContain("Deletion impact for {impact.name}");
    expect(workspaceDangerSource).not.toContain("Type <strong>");
    expect(workspaceDangerSource).not.toContain("setConfirmation");
    expect(workspaceDangerSource).toContain("finalConfirmation");
  });

  it("returns to the Project Dashboard only after persisting the deleted server state", () => {
    expect(editorSource).toContain("await onPersist(next); onBack();");
    expect(editorSource).toContain('deleting: ["콘텐츠를 백업하고 정리하고 있습니다."');
  });
});
