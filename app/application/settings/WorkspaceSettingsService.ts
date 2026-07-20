import { access, readdir } from "node:fs/promises";
import path from "node:path";

import { resolveOpenAIModelPolicy } from "../OpenAIModelPolicy";

import type { PlatformConnection } from "../../../core/connections";
import {
  supportedWorkspacePlatforms,
  type ThemePreference, type UserData, type WorkspacePlatform, type WorkspacePublishingPolicy, type WorkspaceSettings,
} from "../../user-flow/user-data";

export type SettingsStatus = "ready" | "connected" | "verification_required" | "configuration_required" | "unavailable" | "error" | "cleanup_required" | "not_supported";

export const defaultPublishingPolicy: WorkspacePublishingPolicy = Object.freeze({ reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true });
export const defaultEnabledPlatforms: readonly WorkspacePlatform[] = Object.freeze([]);
export const defaultWorkspaceSettings: WorkspaceSettings = Object.freeze({ enabledPlatforms: defaultEnabledPlatforms, publishing: defaultPublishingPolicy, appearance: Object.freeze({ theme: "system" }) });

export function resolveWorkspaceSettings(data: UserData): WorkspaceSettings {
  const stored = data.workspace?.settings;
  return {
    enabledPlatforms: validEnabledPlatforms(stored?.enabledPlatforms),
    publishing: { ...defaultPublishingPolicy, sequentialDraftSave: stored?.publishing?.sequentialDraftSave !== false },
    appearance: { theme: validTheme(stored?.appearance?.theme) },
  };
}

export function updateEnabledPlatforms(data: UserData, platforms: unknown, now = new Date()): UserData {
  if (!data.workspace) throw new Error("Workspace was not found.");
  if (!Array.isArray(platforms)) throw new Error("Enabled platforms must be a list.");
  const enabledPlatforms = validEnabledPlatforms(platforms, []);
  if (enabledPlatforms.length !== new Set(platforms).size || platforms.some((value) => !supportedWorkspacePlatforms.includes(value as WorkspacePlatform))) {
    throw new Error("An unsupported platform was selected.");
  }
  const current = resolveWorkspaceSettings(data);
  return { ...data, workspace: { ...data.workspace, updatedAt: now.toISOString(), settings: { ...current, enabledPlatforms } } };
}

export function isPlatformEnabled(data: UserData, platform: WorkspacePlatform): boolean {
  return resolveWorkspaceSettings(data).enabledPlatforms.includes(platform);
}

export function updateWorkspaceName(data: UserData, name: string, now = new Date()): UserData {
  if (!data.workspace) throw new Error("워크스페이스를 찾을 수 없습니다.");
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 80) throw new Error("워크스페이스 이름은 1~80자로 입력해 주세요.");
  return { ...data, workspace: { ...data.workspace, name: normalized, updatedAt: now.toISOString() } };
}

export function updatePublishingPolicy(data: UserData, sequentialDraftSave: boolean, now = new Date()): UserData {
  if (!data.workspace) throw new Error("워크스페이스를 찾을 수 없습니다.");
  const current = resolveWorkspaceSettings(data);
  return {
    ...data,
    workspace: {
      ...data.workspace,
      updatedAt: now.toISOString(),
      settings: {
        ...current,
        publishing: {
          ...defaultPublishingPolicy,
          sequentialDraftSave,
        },
      },
    },
  };
}

export function updateAppearance(data: UserData, theme: unknown, now = new Date()): UserData {
  if (!data.workspace) throw new Error("워크스페이스를 찾을 수 없습니다.");
  if (theme !== "system" && theme !== "light" && theme !== "dark") throw new Error("지원하지 않는 테마입니다.");
  const current = resolveWorkspaceSettings(data);
  return { ...data, workspace: { ...data.workspace, updatedAt: now.toISOString(), settings: { ...current, appearance: { theme } } } };
}

export function aiProviderStatus(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const key = environment.OPENAI_API_KEY;
  const models = resolveOpenAIModelPolicy(environment);
  const base = { provider: "OpenAI", generationModel: models.generationModel, reviewModel: models.reviewModel };
  if (!key) return { ...base, status: "configuration_required" as const, configured: false, message: "OPENAI_API_KEY 설정이 필요합니다. .env 변경 후 개발 서버를 다시 시작해 주세요." };
  if (!/^[\x21-\x7e]+$/.test(key)) return { ...base, status: "error" as const, configured: true, message: "API 키 형식이 올바르지 않습니다. .env를 확인한 뒤 서버를 다시 시작해 주세요." };
  return { ...base, status: "ready" as const, configured: true, message: "환경변수 구성이 확인되었습니다. 상태 확인은 유료 API를 호출하지 않습니다." };
}

export function connectionSummary(connections: readonly PlatformConnection[], platform: "tistory" | "wordpress") {
  const matches = connections.filter((connection) => connection.platform === platform);
  const connected = matches.filter((connection) => connection.status === "connected");
  const cleanup = matches.filter((connection) => connection.status === "failed" && connection.publicMetadata.cleanupRequired === true);
  const status: SettingsStatus = cleanup.length ? "cleanup_required" : connected.length ? "connected" : matches.length ? "verification_required" : "configuration_required";
  return { status, accountCount: matches.length, connectedCount: connected.length, lastVerifiedAt: latest(matches.map((item) => item.lastVerifiedAt)), error: safeConnectionError(matches) };
}

export async function automationStatus() {
  const workers = [
    path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-draft-worker.mjs"),
    path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-media-preparation-worker.mjs"),
  ];
  const browserRoots = candidateBrowserRoots();
  let chromiumAvailable = false;
  let workerRegistered = false;
  for (const root of browserRoots) {
    try { if ((await readdir(root)).some((name) => name.startsWith("chromium-") || name.startsWith("chromium_headless_shell-"))) { chromiumAvailable = true; break; } } catch { /* try the next standard browser location */ }
  }
  try { await Promise.all(workers.map((worker) => access(worker))); workerRegistered = true; } catch { workerRegistered = false; }
  const ready = chromiumAvailable && workerRegistered;
  return { status: ready ? "ready" as const : "unavailable" as const, backendAvailable: true, chromiumAvailable, workerRegistered, checkedAt: new Date().toISOString(), message: ready ? "Tistory 임시저장과 이미지 준비 자동화를 사용할 수 있습니다." : "콘텐츠 작성과 편집은 가능하지만 Tistory 임시저장 또는 이미지 준비 자동화는 사용할 수 없습니다." };
}

function candidateBrowserRoots() {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const roots = [
    configured && configured !== "0" ? path.resolve(configured) : undefined,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
    path.join(process.cwd(), "node_modules", "playwright-core", ".local-browsers"),
  ];
  return roots.filter((value): value is string => Boolean(value));
}

function validTheme(value: unknown): ThemePreference { return value === "light" || value === "dark" ? value : "system"; }
function validEnabledPlatforms(value: unknown, fallback: readonly WorkspacePlatform[] = defaultEnabledPlatforms): readonly WorkspacePlatform[] {
  if (!Array.isArray(value)) return Object.freeze([...fallback]);
  return Object.freeze(supportedWorkspacePlatforms.filter((platform) => value.includes(platform)));
}
function latest(values: readonly (string | undefined)[]) { return values.filter((value): value is string => Boolean(value)).sort().at(-1); }
function safeConnectionError(connections: readonly PlatformConnection[]) {
  const failed = connections.find((connection) => connection.status === "failed" || connection.status === "expired");
  return typeof failed?.publicMetadata.safeError === "string" ? failed.publicMetadata.safeError.slice(0, 160) : undefined;
}
