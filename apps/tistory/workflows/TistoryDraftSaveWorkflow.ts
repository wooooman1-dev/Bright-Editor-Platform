import type { EditorAdapter } from "../../../core/editor";
import type { TistoryDraftCommand } from "../publishing/TistoryPublishingAdapter";

export type TistoryDraftVerification = Readonly<{
  saveClicked: boolean;
  saveNotificationDetected: boolean;
  draftIdDetected: boolean;
  draftListVerified: boolean;
  reopenedDraftVerified: boolean;
  titleMatched: boolean;
  bodyMatched: boolean;
  publicPostCreated: false;
}>;
export type TistoryDraftSaveResult = TistoryDraftVerification & Readonly<{
  status: "saved" | "partially_verified" | "failed";
  error?: string;
  draftId?: string;
  editorUrl?: string;
}>;

export interface TistoryDraftVerifier { verifyDraft(command: TistoryDraftCommand): Promise<Omit<TistoryDraftSaveResult, "status">>; }

export async function saveTistoryDraft(adapter: EditorAdapter, command: TistoryDraftCommand): Promise<TistoryDraftSaveResult> {
  try {
    await adapter.prepare();
    if (!await adapter.isReady()) return failed("Tistory editor is not ready.");
    await adapter.setTitle(command.title);
    await adapter.setContent(command.html);
    await adapter.saveDraft();
    if (!("verifyDraft" in adapter) || typeof adapter.verifyDraft !== "function") {
      return { ...emptyVerification(), saveClicked: true, status: "partially_verified" };
    }
    const verification = await (adapter as EditorAdapter & TistoryDraftVerifier).verifyDraft(command);
    const reliable = verification.saveClicked && verification.saveNotificationDetected && verification.reopenedDraftVerified
      && verification.titleMatched && verification.bodyMatched && verification.publicPostCreated === false;
    return { ...verification, status: reliable ? "saved" : "partially_verified" };
  } catch (error) { return failed(error instanceof Error ? error.message : "Tistory draft save failed."); }
}

function failed(error: string): TistoryDraftSaveResult { return { ...emptyVerification(), error, status: "failed" }; }
function emptyVerification(): TistoryDraftVerification { return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false }; }
