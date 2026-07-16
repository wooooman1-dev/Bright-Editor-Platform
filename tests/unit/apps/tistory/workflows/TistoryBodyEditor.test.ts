import { describe, expect, it } from "vitest";

import { automationClicksAllowed, editorStateSynchronized, readOnlyClicksAllowed, reopenedDraftVerified, selectCodeMirrorCandidate, selectDraftCandidate, semanticHtmlVerified, verifyCategoryEvidence } from "../../../../../apps/tistory/workflows/tistory-body-editor.mjs";

const bodyEditor = { index: 1, initialized: true, attached: true, readOnly: false, auxiliary: false, inEditorContainer: true, inActiveModeRegion: true, modeName: "htmlmixed", textareaAttached: true, width: 0, height: 0, display: "none", visibility: "hidden" };

describe("Tistory body editor identification", () => {
  it("selects the connected HTML editor even when its internal textarea and wrapper are hidden", () => {
    expect(selectCodeMirrorCandidate([bodyEditor])?.index).toBe(1);
  });

  it("excludes auxiliary and read-only CodeMirror instances", () => {
    const selected = selectCodeMirrorCandidate([
      { ...bodyEditor, index: 0, auxiliary: true, width: 900, height: 500 },
      { ...bodyEditor, index: 2, readOnly: true, width: 900, height: 500 },
      bodyEditor,
    ]);
    expect(selected?.index).toBe(1);
  });

  it("uses editor-container and active-mode evidence instead of array position", () => {
    const selected = selectCodeMirrorCandidate([
      { ...bodyEditor, index: 0, inEditorContainer: false, inActiveModeRegion: false, width: 1000, height: 600 },
      bodyEditor,
    ]);
    expect(selected?.index).toBe(1);
  });

  it("rejects an ambiguous pair instead of choosing first or last", () => {
    expect(selectCodeMirrorCandidate([bodyEditor, { ...bodyEditor, index: 2 }])).toBeUndefined();
  });

  it("requires editor model, backing textarea, rendered DOM, and change evidence", () => {
    expect(editorStateSynchronized({ instanceContainsProbe: true, stableAfterReactUpdate: true, backingTextareaApplicable: true, textareaContainsProbe: true, renderedContainsProbe: true, changeObserved: true })).toBe(true);
    expect(editorStateSynchronized({ instanceContainsProbe: true, stableAfterReactUpdate: true, backingTextareaApplicable: true, textareaContainsProbe: false, renderedContainsProbe: true, changeObserved: true })).toBe(false);
    expect(editorStateSynchronized({ instanceContainsProbe: true, stableAfterReactUpdate: true, backingTextareaApplicable: false, textareaContainsProbe: false, renderedContainsProbe: true, changeObserved: true })).toBe(true);
    expect(editorStateSynchronized({ instanceContainsProbe: true, stableAfterReactUpdate: false, backingTextareaApplicable: false, textareaContainsProbe: false, renderedContainsProbe: true, changeObserved: true })).toBe(false);
  });

  it("requires one draft click and forbids complete or publish controls", () => {
    expect(automationClicksAllowed({ draft: 1, complete: 0, publish: 0 })).toBe(true);
    expect(automationClicksAllowed({ draft: 2, complete: 0, publish: 0 })).toBe(false);
    expect(automationClicksAllowed({ draft: 1, complete: 1, publish: 0 })).toBe(false);
  });

  it("requires every restricted click count to remain zero during read-only reopen", () => {
    expect(readOnlyClicksAllowed({ draft: 0, complete: 0, publish: 0, schedule: 0, delete: 0 })).toBe(true);
    expect(readOnlyClicksAllowed({ draft: 1, complete: 0, publish: 0, schedule: 0, delete: 0 })).toBe(false);
    expect(readOnlyClicksAllowed({ draft: 0, complete: 0, publish: 0, schedule: 0, delete: 1 })).toBe(false);
  });

  it("selects only an exact visible title inside the Draft list and excludes the editor textarea", () => {
    const title = "Existing Draft";
    const selected = selectDraftCandidate([
      { scope: "page", visible: true, tagName: "textarea", title, id: "post-title" },
      { scope: "draft-list", visible: true, tagName: "li", title, id: "draft-42" },
    ], title);
    expect(selected.candidate?.id).toBe("draft-42");
  });

  it("prefers a Draft ID and stops on ambiguous exact-title candidates", () => {
    const candidates = [
      { scope: "draft-list", visible: true, tagName: "li", title: "Same", id: "draft-1" },
      { scope: "draft-list", visible: true, tagName: "li", title: "Same", id: "draft-2" },
    ];
    expect(selectDraftCandidate(candidates, "Same").code).toBe("duplicate_draft_candidates");
    expect(selectDraftCandidate(candidates, "Same", "draft-2").candidate?.id).toBe("draft-2");
  });

  it("rejects semantic HTML verification when body structure or links are missing", () => {
    const complete = { textLengthWithinTolerance: true, firstParagraphMatched: true, paragraphCount: 4, h2Matched: true, tocMatched: true, internalLinksMatched: true, relatedLinksMatched: true, ctaLinksMatched: true, invalidPlaceholderLinks: 0, imagesMatched: true };
    expect(semanticHtmlVerified(complete)).toBe(true);
    expect(semanticHtmlVerified({ ...complete, relatedLinksMatched: false })).toBe(false);
    expect(semanticHtmlVerified({ ...complete, h2Matched: false })).toBe(false);
  });

  it("requires title, body, category, structure, and non-public state after reopen", () => {
    const complete = { titleMatched: true, bodyMatched: true, categoryMatched: true, structureMatched: true, publicPostCreated: false };
    expect(reopenedDraftVerified(complete)).toBe(true);
    expect(reopenedDraftVerified({ ...complete, titleMatched: false })).toBe(false);
    expect(reopenedDraftVerified({ ...complete, bodyMatched: false })).toBe(false);
    expect(reopenedDraftVerified({ ...complete, categoryMatched: false })).toBe(false);
    expect(reopenedDraftVerified({ ...complete, publicPostCreated: true })).toBe(false);
  });

  it("verifies category ID and the post-selection health label independently", () => {
    expect(verifyCategoryEvidence({ controlText: "건강정보", ariaLabel: "", controlSelectedId: "1038988", selectedOptions: [], hiddenValues: [] }, "1038988", "건강정보")).toMatchObject({ passed: true, idVerified: true, nameVerified: true });
    expect(verifyCategoryEvidence({ controlText: "건강정보", ariaLabel: "", controlSelectedId: "", selectedOptions: [], hiddenValues: [] }, "1038988", "건강정보")).toMatchObject({ passed: true, idVerified: false, nameVerified: true });
    expect(verifyCategoryEvidence({ controlText: "건강정보", ariaLabel: "", controlSelectedId: "1057542", selectedOptions: [], hiddenValues: [] }, "1038988", "건강정보")).toMatchObject({ passed: false, code: "category_id_mismatch" });
    expect(verifyCategoryEvidence({ controlText: "건강운동", ariaLabel: "", controlSelectedId: "", selectedOptions: [], hiddenValues: [] }, "1038988", "건강정보")).toMatchObject({ passed: false, code: "category_name_mismatch" });
  });
});
