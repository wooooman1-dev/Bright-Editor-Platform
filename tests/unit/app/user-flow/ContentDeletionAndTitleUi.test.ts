import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync(join(process.cwd(), "app/user-flow/EditorWorkspace.tsx"), "utf8");
const titleSource = readFileSync(join(process.cwd(), "app/user-flow/ContentSeoTitleStatus.tsx"), "utf8");
const dangerSource = readFileSync(join(process.cwd(), "app/user-flow/ContentDangerZone.tsx"), "utf8");

describe("Editor content title and deletion UX", () => {
  it("shows exact primary-keyword title status and one-click correction", () => {
    expect(editorSource).toContain("<ContentSeoTitleStatus");
    expect(editorSource).toContain("primaryKeyword={content.primaryKeyword}");
    expect(titleSource).toContain("대표 키워드가 제목에 없습니다.");
    expect(titleSource).toContain("대표 키워드로 제목 보정");
    expect(titleSource).toContain("buildReadableSeoTitle(currentTitle, keyword)");
  });

  it("synchronizes a server-corrected Quality Review document into the editor", () => {
    expect(editorSource).toContain("document?: ContentDocument; quality?: QualityReport; data?: UserData");
    expect(editorSource).toContain("await onPersist(response.data)");
    expect(editorSource).toContain("setDocumentDraft(response.document); setTitle(response.document.title)");
    expect(editorSource).toContain("대표 키워드를 포함하도록 제목을 보정하고 품질 검토를 완료했습니다.");
  });

  it("shows a backup-first danger zone with exact server title confirmation", () => {
    expect(editorSource).toContain("<ContentDangerZone");
    expect(dangerSource).toContain("삭제 영향도");
    expect(dangerSource).toContain("외부 Tistory 글 삭제: 없음");
    expect(dangerSource).toContain("삭제 전 로컬 백업이 자동 생성됩니다.");
    expect(dangerSource).toContain("confirmationTitle.trim() !== impact.title");
    expect(dangerSource).toContain("백업 후 콘텐츠 삭제");
  });

  it("returns to the Project Dashboard only after persisting the deleted server state", () => {
    expect(editorSource).toContain("await onPersist(next); onBack();");
    expect(editorSource).toContain('deleting: ["콘텐츠를 백업하고 정리하고 있습니다."');
  });
});
