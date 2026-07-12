import type { ContentEditorViewModel } from "./content-editor-fixtures";

export const nonPersistentDraftNotice = "Changes remain only in this browser session and were not saved.";

export type EditorLocalState = Readonly<{
  title: string;
  body: string;
  notice: string | null;
}>;

export type EditorLocalAction =
  | Readonly<{ type: "change-title"; value: string }>
  | Readonly<{ type: "change-body"; value: string }>
  | Readonly<{ type: "save-draft" }>;

export function createEditorLocalState(content: ContentEditorViewModel): EditorLocalState {
  return { title: content.title, body: content.body, notice: null };
}

export function reduceEditorLocalState(state: EditorLocalState, action: EditorLocalAction): EditorLocalState {
  switch (action.type) {
    case "change-title":
      return { ...state, title: action.value, notice: null };
    case "change-body":
      return { ...state, body: action.value, notice: null };
    case "save-draft":
      return { ...state, notice: nonPersistentDraftNotice };
  }
}
