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

    expect(html).toContain("Bright Studio / Content Operations Foundation");
    expect(html).toContain("Content Editor");
    expect(html).toContain('value="A practical content workflow map"');
    expect(html).toContain("A dependable content workflow starts with a clear goal.");
    expect(html).toContain("Published");
    expect(html).toContain("Updated Today");
  });

  it("updates title and body only in the local Editor state", () => {
    const content = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!.content;
    const initial = createEditorLocalState(content);
    const withTitle = reduceEditorLocalState(initial, { type: "change-title", value: "Locally edited title" });
    const withBody = reduceEditorLocalState(withTitle, { type: "change-body", value: "Locally edited body" });

    expect(withTitle.title).toBe("Locally edited title");
    expect(withBody.body).toBe("Locally edited body");
    expect(content.title).toBe("A practical content workflow map");
    expect(content.body).not.toBe("Locally edited body");
  });

  it("shows an explicit non-persistent notice for Save Draft without success language", () => {
    const content = getContentEditorState("bright-studio", "content-operations", "content-workflow-map")!.content;
    const html = renderToStaticMarkup(<ContentEditorForm content={content} />);
    const afterSave = reduceEditorLocalState(createEditorLocalState(content), { type: "save-draft" });

    expect(html).toContain("Save Draft");
    expect(html).toContain("This preview does not persist changes.");
    expect(afterSave.notice).toBe(nonPersistentDraftNotice);
    expect(afterSave.notice).toContain("were not saved");
    for (const forbidden of ["Draft saved", "Successfully saved", "Last saved at", "Saved"]) {
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
});
