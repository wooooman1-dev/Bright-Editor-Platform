import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const deletionRoute = readFileSync(join(process.cwd(), "app/api/deletion/route.ts"), "utf8");
const studioRoute = readFileSync(join(process.cwd(), "app/api/studio/route.ts"), "utf8");
const contentService = readFileSync(join(process.cwd(), "app/application/content/ContentDeletionService.ts"), "utf8");
const contentUi = readFileSync(join(process.cwd(), "app/user-flow/ContentDangerZone.tsx"), "utf8");
const projectUi = readFileSync(join(process.cwd(), "app/user-flow/ProjectCardActions.tsx"), "utf8");
const workspaceUi = readFileSync(join(process.cwd(), "app/user-flow/DangerZone.tsx"), "utf8");

describe("deletion confirmation simplification", () => {
  it("does not require content title confirmation in UI, service, or API", () => {
    expect(contentUi).not.toContain("confirmationTitle");
    expect(contentUi).not.toContain("제목을 정확히 입력");
    expect(contentService).not.toContain("confirmationTitle");
    expect(studioRoute).not.toContain("confirmationTitle: required(body.input?.confirmationTitle)");
  });

  it("does not require project or workspace names at the deletion API boundary", () => {
    expect(deletionRoute).not.toContain("Project name confirmation does not match exactly");
    expect(deletionRoute).not.toContain("Workspace name confirmation does not match exactly");
    expect(deletionRoute).not.toContain("body.confirmation");
    expect(deletionRoute).toContain("body.finalConfirmation === true");
  });

  it("keeps impact review and backup-first execution without name-entry fields", () => {
    expect(contentUi).toContain("삭제 영향도");
    expect(contentUi).toContain("백업 후 콘텐츠 삭제");
    expect(projectUi).toContain("삭제 영향을 확인하고 있습니다.");
    expect(projectUi).toContain("백업 후 프로젝트 삭제");
    expect(projectUi).not.toContain("삭제 확인 프로젝트 이름");
    expect(workspaceUi).toContain("Deletion impact for {impact.name}");
    expect(workspaceUi).not.toContain("Type <strong>");
    expect(workspaceUi).toContain("finalConfirmation");
  });
});
