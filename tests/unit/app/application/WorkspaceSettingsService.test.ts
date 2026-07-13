import { describe, expect, it } from "vitest";

import {
  aiProviderStatus, connectionSummary, defaultPublishingPolicy, resolveWorkspaceSettings,
  updateAppearance, updateEnabledPlatforms, updatePublishingPolicy, updateWorkspaceName,
} from "../../../../app/application/settings/WorkspaceSettingsService";
import { hasConfiguredEnabledPlatforms, type UserData } from "../../../../app/user-flow/user-data";
import type { PlatformConnection } from "../../../../core/connections";

const data: UserData = { workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [], contents: [] };

describe("Workspace Settings service", () => {
  it("keeps Review First and Draft Only as immutable safe defaults", () => {
    expect(resolveWorkspaceSettings(data).enabledPlatforms).toEqual([]);
    expect(hasConfiguredEnabledPlatforms(data)).toBe(false);
    expect(resolveWorkspaceSettings(data).publishing).toEqual(defaultPublishingPolicy);
    const updated = updatePublishingPolicy(data, false, new Date("2026-07-13T00:00:00.000Z"));
    expect(updated.workspace?.settings?.publishing).toMatchObject({ reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: false, qualityApprovalRequired: true });
  });

  it("persists enabled platforms without changing existing Workspace data", () => {
    const withReferences: UserData = { ...data, projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", selectedPublishingAccountIds: ["account-1"], createdAt: "now", updatedAt: "now" }], contents: [] };
    const updated = updateEnabledPlatforms(withReferences, ["wordpress", "youtube"], new Date("2026-07-13T00:00:00.000Z"));
    expect(resolveWorkspaceSettings(updated).enabledPlatforms).toEqual(["wordpress", "youtube"]);
    expect(updated.workspace).toMatchObject({ id: "workspace-1", name: "Studio" });
    expect(hasConfiguredEnabledPlatforms(updated)).toBe(true);
    expect(updated.projects[0]?.selectedPublishingAccountIds).toEqual(["account-1"]);
    expect(() => updateEnabledPlatforms(data, ["unknown"])).toThrow("unsupported platform");
  });

  it("does not repeat onboarding after later Settings edits, including an empty selection", () => {
    const configured = updateEnabledPlatforms(data, ["tistory"]);
    const edited = updateEnabledPlatforms(configured, []);
    expect(resolveWorkspaceSettings(edited).enabledPlatforms).toEqual([]);
    expect(hasConfiguredEnabledPlatforms(edited)).toBe(true);
  });

  it("persists validated Workspace name and appearance without changing ownership", () => {
    const renamed = updateWorkspaceName(data, "  New   Studio  ", new Date("2026-07-13T00:00:00.000Z"));
    const themed = updateAppearance(renamed, "dark", new Date("2026-07-13T00:01:00.000Z"));
    expect(themed.workspace).toMatchObject({ id: "workspace-1", name: "New Studio", settings: { appearance: { theme: "dark" } } });
    expect(() => updateAppearance(data, "purple")).toThrow("지원하지 않는 테마");
  });

  it("reports configured, missing, and invalid OpenAI state without exposing the key", () => {
    const missing = aiProviderStatus({ OPENAI_MODEL: "gpt-test" });
    const invalid = aiProviderStatus({ OPENAI_API_KEY: "invalid key" });
    const ready = aiProviderStatus({ OPENAI_API_KEY: "sk-secret-value", OPENAI_MODEL: "gpt-test" });
    expect(missing.status).toBe("configuration_required");
    expect(invalid.status).toBe("error");
    expect(ready).toMatchObject({ status: "ready", configured: true, model: "gpt-test" });
    expect(JSON.stringify([missing, invalid, ready])).not.toContain("sk-secret-value");
  });

  it("calculates platform state from real connection records", () => {
    const connection: PlatformConnection = { id: "account-1", workspaceId: "workspace-1", platform: "tistory", displayName: "Blog", status: "connected", publicMetadata: {}, createdAt: "now", updatedAt: "now", lastVerifiedAt: "2026-07-13T00:00:00.000Z", selectedAsDefault: false, version: 1 };
    expect(connectionSummary([connection], "tistory")).toMatchObject({ status: "connected", accountCount: 1, connectedCount: 1 });
    expect(connectionSummary([{ ...connection, status: "disconnected" }], "tistory").status).toBe("verification_required");
    expect(connectionSummary([], "wordpress").status).toBe("configuration_required");
  });
});
