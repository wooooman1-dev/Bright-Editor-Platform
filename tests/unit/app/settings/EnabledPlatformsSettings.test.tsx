import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { jobNotice, SettingsConnections } from "../../../../app/settings/SettingsConnections";
import { Overview } from "../../../../app/settings/WorkspaceSettings";
import type { SettingsSnapshot } from "../../../../app/settings/settings-types";

const snapshot: SettingsSnapshot = {
  workspace: { id: "workspace-1", name: "Studio", projectCount: 0, contentCount: 0, publishingAccountCount: 2 },
  settings: { enabledPlatforms: ["tistory", "wordpress"], publishing: { reviewFirst: true, draftOnly: true, publicPublish: false, sequentialDraftSave: true, qualityApprovalRequired: true }, appearance: { theme: "system" } },
  ai: { provider: "OpenAI", status: "ready", configured: true, model: "test", message: "Ready" },
  platforms: { tistory: { status: "connected", accountCount: 1, connectedCount: 1 }, wordpress: { status: "configuration_required", accountCount: 0, connectedCount: 0 } },
  connections: [], automation: { status: "ready", backendAvailable: true, chromiumAvailable: true, workerRegistered: true, tistorySessionReady: true, checkedAt: "now", message: "Ready" },
  backup: {}, persistence: { status: "ready", message: "Ready" }, publishing: { status: "ready", message: "Ready" },
};

describe("Enabled Platforms Settings UI", () => {
  it("renders only enabled platforms in Overview", () => {
    const html = renderToStaticMarkup(<Overview setSection={vi.fn()} snapshot={snapshot} />);
    expect(html).toContain("Tistory");
    expect(html).toContain("WordPress");
    expect(html).not.toContain("YouTube");
    expect(html).not.toContain("Naver Cafe");
  });

  it("renders only enabled platforms in Platform Connections", () => {
    const html = renderToStaticMarkup(<SettingsConnections connections={[]} enabledPlatforms={["youtube"]} onRefresh={vi.fn()} workspaceId="workspace-1" />);
    expect(html).toContain("YouTube");
    expect(html).not.toContain("Tistory");
    expect(html).not.toContain("WordPress");
    expect(html).not.toContain("Naver Cafe");
  });

  it("shows the safe job reason and remediation without internal details", () => {
    const notice = jobNotice({ message: "failed", failureCode: "network_access_denied", safeMessage: "Tistory network access is blocked on this machine.", remediation: "Check the firewall or proxy." });
    expect(notice).toBe("Tistory network access is blocked on this machine. Check the firewall or proxy.");
    expect(notice).not.toContain("stack");
  });
});
