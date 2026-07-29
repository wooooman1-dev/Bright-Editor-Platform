import type { PublishingExecutionRecord } from "../../core/publishing";
import type { WordPressDraftReadiness } from "../application/publishing/WordPressDraftReadiness";

export type WordPressDraftExecutionIdentity = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  contentRevisionId: string;
  connectionId: string;
}>;

export type WordPressDraftOverlayState = Readonly<{
  identity?: WordPressDraftExecutionIdentity;
  identityKey: string;
  requestId: number;
  readiness?: WordPressDraftReadiness;
  record?: PublishingExecutionRecord;
  finalConfirmation: boolean;
  notice: string;
  loading: boolean;
}>;

export type WordPressDraftModalView = "preparation" | "previous_result" | "execution_result";

export type WordPressDraftModalViewAction = Readonly<
  | { type: "open" }
  | { type: "show_preparation" }
  | { type: "show_previous_result"; hasRecord: boolean }
  | { type: "execution_completed"; hasRecord: boolean }
>;

export type WordPressDraftSubmissionGuard = Readonly<{
  identity?: WordPressDraftExecutionIdentity;
  executionState: WordPressDraftOverlayState;
  categorySelectionApplied: boolean;
  readinessMatchesAppliedCategory: boolean;
  categoryLoading: boolean;
  categorySaving: boolean;
}>;

export type WordPressDraftOverlayAction = Readonly<
  | { type: "confirm"; identityKey: string; value: boolean }
  | { type: "preparation_changed"; identityKey: string }
  | { type: "readiness_resolved"; identityKey: string; requestId: number; readiness?: WordPressDraftReadiness; record?: PublishingExecutionRecord; readinessError?: string }
  | { type: "readiness_failed"; identityKey: string; requestId: number; error: string }
  | { type: "execution_started"; identityKey: string; notice: string }
  | { type: "execution_completed"; identityKey: string; readiness?: WordPressDraftReadiness; record?: PublishingExecutionRecord; notice: string }
  | { type: "execution_failed"; identityKey: string; error: string }
>;

export function wordpressDraftExecutionIdentityKey(identity: WordPressDraftExecutionIdentity | undefined): string {
  if (!identity) return "";
  return [
    identity.workspaceId,
    identity.projectId,
    identity.contentId,
    identity.contentRevisionId,
    identity.connectionId,
  ].map((value) => encodeURIComponent(value.trim())).join("|");
}

export function resetWordPressDraftOverlayState(
  identity: WordPressDraftExecutionIdentity | undefined,
  previousRequestId = 0,
): WordPressDraftOverlayState {
  return Object.freeze({
    ...(identity ? { identity } : {}),
    identityKey: wordpressDraftExecutionIdentityKey(identity),
    requestId: previousRequestId + 1,
    readiness: undefined,
    record: undefined,
    finalConfirmation: false,
    notice: "",
    loading: true,
  });
}

export function reduceWordPressDraftOverlayState(
  state: WordPressDraftOverlayState,
  action: WordPressDraftOverlayAction,
): WordPressDraftOverlayState {
  if (!action.identityKey || action.identityKey !== state.identityKey) return state;
  if ((action.type === "readiness_resolved" || action.type === "readiness_failed")
    && action.requestId !== state.requestId) return state;

  if (action.type === "confirm") return Object.freeze({ ...state, finalConfirmation: action.value });
  if (action.type === "preparation_changed") {
    return Object.freeze({
      ...state,
      requestId: state.requestId + 1,
      readiness: undefined,
      record: undefined,
      finalConfirmation: false,
      notice: "",
      loading: false,
    });
  }
  if (action.type === "readiness_resolved") {
    return Object.freeze({
      ...state,
      readiness: action.readiness,
      record: action.record,
      notice: action.readinessError ?? "",
      loading: false,
    });
  }
  if (action.type === "readiness_failed") {
    return Object.freeze({ ...state, readiness: undefined, record: undefined, notice: action.error, loading: false });
  }
  if (action.type === "execution_started") {
    return Object.freeze({ ...state, loading: true, notice: action.notice });
  }
  if (action.type === "execution_completed") {
    return Object.freeze({
      ...state,
      readiness: action.readiness ?? state.readiness,
      record: action.record ?? state.record,
      finalConfirmation: false,
      notice: action.notice,
      loading: false,
    });
  }
  return Object.freeze({ ...state, notice: action.error, loading: false });
}

export function canExecuteWordPressDraft(state: WordPressDraftOverlayState): boolean {
  return Boolean(state.readiness?.ready
    && state.finalConfirmation
    && !state.loading
    && !blocksExistingRecord(state.record));
}

export function canSubmitWordPressDraft(input: WordPressDraftSubmissionGuard): boolean {
  return Boolean(input.identity
    && input.categorySelectionApplied
    && input.readinessMatchesAppliedCategory
    && !input.categoryLoading
    && !input.categorySaving
    && canExecuteWordPressDraft(input.executionState));
}

export function reduceWordPressDraftModalView(
  state: WordPressDraftModalView,
  action: WordPressDraftModalViewAction,
): WordPressDraftModalView {
  if (action.type === "open" || action.type === "show_preparation") return "preparation";
  if (action.type === "show_previous_result") return action.hasRecord ? "previous_result" : state;
  return action.hasRecord ? "execution_result" : "preparation";
}

export function wordpressCategorySelectionKey(categoryIds: readonly string[]): string {
  return [...new Set(categoryIds.map((value) => value.trim()).filter(Boolean))]
    .sort()
    .map((value) => encodeURIComponent(value))
    .join("|");
}

export function isWordPressCategorySelectionApplied(
  selectedCategoryIds: readonly string[],
  appliedCategoryIds: readonly string[],
): boolean {
  const selectedKey = wordpressCategorySelectionKey(selectedCategoryIds);
  return Boolean(selectedKey && selectedKey === wordpressCategorySelectionKey(appliedCategoryIds));
}

function blocksExistingRecord(record: PublishingExecutionRecord | undefined): boolean {
  return Boolean(record && record.status !== "verified");
}
