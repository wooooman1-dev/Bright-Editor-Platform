import type { UserContent } from "./user-data";

export type ContentOpenDestination = "planning" | "editor";

/**
 * Whether the editor can send the reader back to this article's stored topic
 * candidates.
 *
 * Generation does not consume the Planning candidates — they stay on the
 * Content — but the editor used to offer no way back to them, so switching to
 * another candidate meant paying for a second Planning call and starting a new
 * Content next to the old one. The route is only offered when candidates are
 * actually stored, because a Content created without Planning has nothing to
 * return to.
 */
export function canReopenPlanningCandidates(
  content: Pick<UserContent, "planning">,
): boolean {
  return (content.planning?.opportunityCandidates?.length ?? 0) > 0;
}

export function resolveContentOpenDestination(
  content: Pick<UserContent, "document" | "planningWorkflow">,
): ContentOpenDestination {
  if (content.document) return "editor";

  const status = content.planningWorkflow?.status;
  return status && status !== "generated" && status !== "cancelled"
    ? "planning"
    : "editor";
}
