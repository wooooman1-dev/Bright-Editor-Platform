import type { AutomationPermission, ConnectionStatus, Platform } from "../../core/connections";
import type { ThemePreference, WorkspacePlatform, WorkspaceSettings } from "../user-flow/user-data";
import type { SettingsStatus } from "../application/settings/WorkspaceSettingsService";

export type PublicConnection = Readonly<{
  id: string;
  platform: Platform;
  displayName: string;
  status: ConnectionStatus;
  lastVerifiedAt?: string;
  updatedAt: string;
  permissions: readonly AutomationPermission[];
  publishingPolicy: "review_first";
  publicMetadata: Readonly<Record<string, unknown>>;
  projectReferenceCount?: number;
  contentReferenceCount?: number;
  activeJobId?: string;
}>;

export type StatusSummary = Readonly<{
  status: SettingsStatus;
  accountCount?: number;
  connectedCount?: number;
  lastVerifiedAt?: string;
  error?: string;
  message?: string;
}>;

export type SettingsSnapshot = Readonly<{
  workspace: Readonly<{ id: string; name: string; createdAt?: string; updatedAt?: string; projectCount: number; contentCount: number; publishingAccountCount: number }>;
  settings: WorkspaceSettings;
  ai: Readonly<{ provider: string; status: SettingsStatus; configured: boolean; generationModel: string; reviewModel: string; message: string }>;
  platforms: Readonly<Partial<Record<WorkspacePlatform, StatusSummary>>>;
  connections: readonly PublicConnection[];
  automation: Readonly<{ status: SettingsStatus; backendAvailable: boolean; chromiumAvailable: boolean; workerRegistered: boolean; tistorySessionReady: boolean; checkedAt: string; message: string }>;
  backup: Readonly<{ status?: SettingsStatus; message?: string; name?: string; modifiedAt?: string }>;
  persistence: StatusSummary;
  publishing: StatusSummary;
  projects?: readonly Readonly<{ id: string; name: string }>[];
}>;

export type SettingsSection = "overview" | "ai" | "enabled-platforms" | "connections" | "data-sources" | "publishing" | "media" | "automation" | "workspace" | "appearance" | "danger";
export const themes: readonly ThemePreference[] = ["system", "light", "dark"];
