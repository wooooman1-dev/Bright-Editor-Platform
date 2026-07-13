import { safeDraftPermissions, type AutomationPermission, type PlatformConnection } from "../connections";

export type RegisteredPublishingWorkflow = "connection.verify" | "category.read" | "category.select" | "draft.create" | "draft.verify";

export type PublishingAuthorizationRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  platformConnectionId: string;
  workflow: string;
  finalConfirmation: boolean;
}>;

export class PublishingPermissionGate {
  authorize(request: PublishingAuthorizationRequest, connection: PlatformConnection): AutomationPermission {
    if (connection.workspaceId !== request.workspaceId) throw new PublishingPermissionError("ACCOUNT_WORKSPACE_MISMATCH", "Publishing account does not belong to this Workspace.");
    if (connection.status !== "connected") throw new PublishingPermissionError("ACCOUNT_NOT_VERIFIED", "A verified publishing account is required.");
    const permission = workflowPermission(request.workflow);
    if (!(connection.automationPermissions ?? safeDraftPermissions).includes(permission)) throw new PublishingPermissionError("PERMISSION_DENIED", `The account does not allow ${permission}.`);
    if ((request.workflow === "draft.create" || request.workflow === "draft.verify") && !request.finalConfirmation) {
      throw new PublishingPermissionError("CONFIRMATION_REQUIRED", "Final user confirmation is required.");
    }
    return permission;
  }
}

export class PublishingPermissionError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "PublishingPermissionError"; }
}

function workflowPermission(workflow: string): AutomationPermission {
  const allowed: readonly RegisteredPublishingWorkflow[] = ["connection.verify", "category.read", "category.select", "draft.create", "draft.verify"];
  if (!allowed.includes(workflow as RegisteredPublishingWorkflow)) throw new PublishingPermissionError("WORKFLOW_NOT_REGISTERED", "The requested publishing workflow is not registered.");
  return workflow as AutomationPermission;
}
