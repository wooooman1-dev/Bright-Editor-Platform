import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DevDashboard from "../../../../app/dev/page";
import { fixtureCounts, loadLiveCounts } from "../../../../app/dev/developer-verification";
import { InMemoryPersistenceStore } from "../../../../core/data";

async function renderDashboard(blogName?: string, mode?: "fixture" | "live"): Promise<string> {
  const page = await DevDashboard({ searchParams: Promise.resolve({ ...(blogName === undefined ? {} : { blogName }), ...(mode ? { mode } : {}) }) });
  return renderToStaticMarkup(page);
}

describe("Developer Verification", () => {
  it("renders completed Features, routes, fixture counts, and Architecture Freeze", async () => {
    const html = await renderDashboard(undefined, "fixture");

    expect(html).toContain("Development Mode");
    expect(html).toContain("Developer Verification");
    for (const feature of ["Feature #1", "Feature #2", "Feature #3", "Feature #4", "Feature #5", "Feature #6"]) expect(html).toContain(feature);
    expect(html).toContain("/workspaces/[workspaceId]/projects/[projectId]");
    expect(html).toContain("/contents/[contentId]/edit");
    expect(html).toContain("/contents/[contentId]/publish");
    expect(html).toContain(`>Fixture Workspaces</dt><dd class="mt-2 text-2xl font-semibold tracking-[-0.03em]">${fixtureCounts.workspaces}</dd>`);
    expect(html).toContain(`>Fixture Projects</dt><dd class="mt-2 text-2xl font-semibold tracking-[-0.03em]">${fixtureCounts.projects}</dd>`);
    expect(html).toContain(`>Fixture Contents</dt><dd class="mt-2 text-2xl font-semibold tracking-[-0.03em]">${fixtureCounts.contents}</dd>`);
    expect(html.match(/Fixture data/g)).toHaveLength(3);
    expect(html).toContain("Architecture Freeze");
  });

  it("renders fixture, connection, build, and test information", async () => {
    const html = await renderDashboard(undefined, "fixture");

    expect(html).toContain("Fixture state");
    expect(html).toContain("Placeholder");
    expect(html).toContain("Editor");
    expect(html).toContain("Connected");
    expect(html).toContain("Publish");
    expect(html).toContain("Not connected");
    expect(html).toContain("npm run build");
    expect(html).toContain("npm test");
    expect(html).toContain("BrowserManager");
    expect(html).toContain("BrowserSessionManager");
    expect(html).toContain("BrowserContextManager");
  });

  it("defaults to Live mode and does not render fixture statistics", async () => {
    const html = await renderDashboard();

    expect(html).toContain('aria-label="Dashboard data mode"');
    expect(html).toContain('href="/dev?mode=fixture"');
    expect(html).toContain('aria-current="page" class="rounded-lg');
    expect(html).toContain('href="/dev?mode=live">Live</a>');
    expect(html).toContain("Live Workspaces");
    expect(html).toContain("Live Projects");
    expect(html).toContain("Live Contents");
    expect(html).not.toContain("Fixture Workspaces");
    expect(html).toContain("No fixture data is included.");
  });

  it("reads Live counts only from persisted operational application state", async () => {
    const store = new InMemoryPersistenceStore();
    await store.set("application", "user-data", {
      workspace: { id: "workspace-1", name: "Studio" },
      projects: [{ id: "project-1" }, { id: "project-2" }],
      contents: [{ id: "content-1" }, { id: "content-2" }, { id: "content-3" }],
    });

    await expect(loadLiveCounts(store)).resolves.toEqual({ workspaces: 1, projects: 2, contents: 3 });
  });

  it("preserves URL verification for a valid normalized blog identifier", async () => {
    const html = await renderDashboard("  bright-editor  ");

    expect(html).toContain("https://www.tistory.com/auth/login");
    expect(html).toContain("https://bright-editor.tistory.com/manage");
    expect(html).toContain("https://bright-editor.tistory.com/manage/newpost");
    expect(html).not.toContain("https://  bright-editor  .tistory.com");
  });

  it("renders a safe validation message for an invalid identifier", async () => {
    const html = await renderDashboard("https://example.tistory.com");

    expect(html).toContain("Enter a valid Tistory blog identifier.");
    expect(html).not.toContain("TypeError");
    expect(html).not.toContain("at createTistoryUrls");
  });

  it("remains a responsive development-only UI without the product Global Header", async () => {
    const html = await renderDashboard();

    expect(html).toContain("sm:grid-cols-3");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("Development Build · Live Mode");
    expect(html).not.toContain('aria-label="Global navigation"');
  });
});
