import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { platformConnectionsSettingsPath, WorkspacePlatformOnboarding } from "../../../../app/onboarding/WorkspacePlatformOnboarding";
import { SettingsConnections } from "../../../../app/settings/SettingsConnections";
import { createWorkspace, emptyUserData, hasConfiguredEnabledPlatforms } from "../../../../app/user-flow/user-data";

describe("Workspace platform onboarding", () => {
  it("requires onboarding for a newly created Workspace and targets Platform Connections after save", () => {
    const data = createWorkspace(emptyUserData, "Studio", "workspace 1");
    expect(hasConfiguredEnabledPlatforms(data)).toBe(false);
    expect(platformConnectionsSettingsPath("workspace 1")).toBe("/workspaces/workspace%201/settings?section=connections&from=onboarding");
  });
  it("shows all platform choices with Continue disabled initially", () => {
    const html = renderToStaticMarkup(<WorkspacePlatformOnboarding workspaceId="workspace-1" />);
    expect(html).toContain("Welcome to Bright Studio");
    expect(html).toContain("Tistory");
    expect(html).toContain("WordPress");
    expect(html).toContain("YouTube");
    expect(html).toContain("Naver Cafe");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("offers Skip for now without requiring a connection", () => {
    const html = renderToStaticMarkup(<SettingsConnections connections={[]} enabledPlatforms={["tistory"]} onRefresh={async () => undefined} workspaceId="workspace-1" />);
    expect(html).toContain("계정 연결");
    expect(html).toContain("Skip for now");
  });
});
