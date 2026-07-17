import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProjectCardActions } from "../../../../app/user-flow/ProjectCardActions";

describe("Project Card actions", () => {
  it("exposes an accessible more menu with today, rename, and safe delete actions", () => {
    const html = renderToStaticMarkup(<ProjectCardActions onCreateToday={vi.fn()} onDeleted={vi.fn()} onRename={vi.fn()} project={{ id: "p", workspaceId: "w", name: "건강 프로젝트", description: "", createdAt: "now", updatedAt: "now" }} workspaceId="w" />);
    expect(html).toContain('aria-label="건강 프로젝트 프로젝트 더보기"');
    expect(html).toContain("오늘 글 작성");
    expect(html).toContain("프로젝트 수정");
    expect(html).toContain("프로젝트 삭제");
  });
});
