export type Platform = "tistory" | "wordpress";
export type AutomationPermission =
  | "connection.verify" | "category.read" | "category.select" | "draft.create"
  | "draft.verify" | "draft.update" | "publish.execute" | "post.update" | "post.delete"
  | "account.settings.update";
export const safeDraftPermissions: readonly AutomationPermission[] = Object.freeze([
  "connection.verify", "category.read", "category.select", "draft.create", "draft.verify",
]);
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "verification_required" | "expired" | "failed";
export type PlatformConnection = Readonly<{
  id: string; workspaceId: string; platform: Platform; displayName: string;
  status: ConnectionStatus; publicMetadata: Readonly<Record<string, unknown>>;
  secretReference?: string; createdAt: string; updatedAt: string;
  lastVerifiedAt?: string; selectedAsDefault: boolean; version: number;
  automationPermissions?: readonly AutomationPermission[];
  publishingPolicy?: "review_first";
}>;
export type PublishingTarget = Readonly<{ projectId: string; platformConnectionId: string; platform: Platform; selectedAt: string }>;
export type ConnectionVerificationResult = Readonly<{ connected: boolean; error?: string; publicMetadata?: Readonly<Record<string, unknown>>; verifiedAt: string }>;
