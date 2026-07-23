import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import ContentEditorPage from "../../../../app/workspaces/[workspaceId]/projects/[projectId]/contents/[contentId]/edit/page";

function renderPage(workspaceId: string, projectId: string, contentId: string) {
  return ContentEditorPage({ params: Promise.resolve({ workspaceId, projectId, contentId }) });
}

describe("ContentEditorPage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("redirects a persisted Content route into the canonical Workspace editor", async () => {
    await expect(renderPage("workspace-1", "project-1", "content-1")).rejects.toThrow(
      "NEXT_REDIRECT:/workspaces/workspace-1?view=editor&projectId=project-1&contentId=content-1",
    );

    expect(redirectMock).toHaveBeenCalledWith(
      "/workspaces/workspace-1?view=editor&projectId=project-1&contentId=content-1",
    );
  });

  it("encodes route identifiers before redirecting", async () => {
    await expect(renderPage("workspace / 한글", "project & 1", "content ? 1")).rejects.toThrow("NEXT_REDIRECT:");

    expect(redirectMock).toHaveBeenCalledWith(
      "/workspaces/workspace%20%2F%20%ED%95%9C%EA%B8%80?view=editor&projectId=project+%26+1&contentId=content+%3F+1",
    );
  });
});
