import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContentEditor } from "../../../../app/contents/ContentEditor";
import { ContentEditorForm } from "../../../../app/contents/ContentEditorForm";
import { getContentEditorState } from "../../../../app/contents/content-editor-fixtures";
import {
  createEditorLocalState,
  nonPersistentDraftNotice,
  reduceEditorLocalState,
} from "../../../../app/contents/editor-state";

describe("ContentEditor", () => {
  it("renders Workspace, Project, and Content context with initial values", () => {
    const state = getContentEditorState("bright-studio", "content-operations", "content-workflow-map");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<ContentEditor state={state!} />);

    expect(html).toContain("Bright Studio / 콘텐츠 운영 기반");
    expect(html).toContain("콘텐츠 편집기");
    expect(html).toContain('value="실용적인 콘텐츠 작업 흐름"');
    expect(html).toContain("신뢰할 수 있는 콘텐츠 작업 흐름은 명확한 목표에서 시작합니다.");
    expect(html).toContain("발행됨");
    expect(html).toContain("최근 수정 오늘");
  });

  it("updates title and body only in the local Editor state", () => {
    const content = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!.content;
    const initial = createEditorLocalState(content);
    const withTitle = reduceEditorLocalState(initial, { type: "change-title", value: "Locally edited title" });
    const withBody = reduceEditorLocalState(withTitle, { type: "change-body", value: "Locally edited body" });

    expect(withTitle.title).toBe("Locally edited title");
    expect(withBody.body).toBe("Locally edited body");
    expect(content.title).toBe("실용적인 콘텐츠 작업 흐름");
    expect(content.body).not.toBe("Locally edited body");
  });

  it("shows an explicit non-persistent notice for Save Draft without success language", () => {
    const content = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!.content;
    const html = renderToStaticMarkup(<ContentEditorForm content={content} />);
    const afterSave = reduceEditorLocalState(createEditorLocalState(content), { type: "save-draft" });

    expect(html).toContain("임시저장 확인");
    expect(html).toContain("현재 버전에서는 변경 내용이 실제로 저장되지 않습니다.");
    expect(afterSave.notice).toBe(nonPersistentDraftNotice);
    expect(afterSave.notice).toContain("저장되지 않았습니다");
    for (const forbidden of ["저장 완료", "성공적으로 저장됨", "초안 저장됨"]) {
      expect(html).not.toContain(forbidden);
      expect(afterSave.notice).not.toContain(forbidden);
    }
  });

  it("recreates initial fixture values after a new local session", () => {
    const content = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!.content;
    const edited = reduceEditorLocalState(createEditorLocalState(content), { type: "change-title", value: "Temporary title" });
    const refreshed = createEditorLocalState(content);

    expect(edited.title).toBe("Temporary title");
    expect(refreshed.title).toBe(content.title);
    expect(refreshed.notice).toBeNull();
  });

  it("has no sidebar and includes mobile, tablet, and desktop layout rules", () => {
    const state = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!;
    const html = renderToStaticMarkup(<ContentEditor state={state} />);

    expect(html).not.toContain("<aside");
    expect(html).toContain("px-5");
    expect(html).toContain("sm:px-8");
    expect(html).toContain("lg:px-10");
    expect(html).toContain("md:flex-row");
    expect(html).toContain("sm:min-h-96");
  });

  it("links the current Content to its Publish preparation route", () => {
    const state = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!;
    const html = renderToStaticMarkup(<ContentEditor state={state} />);

    expect(html).toContain('href="/workspaces/bright-studio/projects/content-operations/contents/content-workflow-map/publish"');
    expect(html).toContain("발행 준비 확인");
  });
});
