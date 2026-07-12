import type { ContentEditorViewModel } from "./content-editor-fixtures";

export const nonPersistentDraftNotice = "변경 내용은 현재 화면에만 유지되며 저장되지 않았습니다.";

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
