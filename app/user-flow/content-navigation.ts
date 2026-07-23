import type { UserContent } from "./user-data";

export type ContentOpenDestination = "planning" | "editor";

export function resolveContentOpenDestination(
  content: Pick<UserContent, "document" | "planningWorkflow">,
): ContentOpenDestination {
  if (content.document) return "editor";

  const status = content.planningWorkflow?.status;
  return status && status !== "generated" && status !== "cancelled"
    ? "planning"
    : "editor";
}
