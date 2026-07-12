import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublishAction } from "../../../../app/publish/PublishAction";
import { PublishPreparation } from "../../../../app/publish/PublishPreparation";
import { getPublishPreparationState } from "../../../../app/publish/publish-preparation-fixtures";
import {
  createPublishActionState,
  publishUnavailableNotice,
  showPublishUnavailableNotice,
} from "../../../../app/publish/publish-action-state";

describe("PublishPreparation", () => {
  it("renders Workspace, Project, Content, readiness, platform, and checklist context", () => {
    const state = getPublishPreparationState("bright-studio", "content-operations", "content-workflow-map");
    expect(state).toBeDefined();
    const html = renderToStaticMarkup(<PublishPreparation state={state!} />);

    expect(html).toContain("Bright Studio / Content Operations Foundation");
    expect(html).toContain("A practical content workflow map");
    expect(html).toContain("Publish readiness");
    expect(html).toContain("Content selected");
    expect(html).toContain("Draft available");
    expect(html).toContain("Platform connection");
    expect(html).toContain("Not connected");
    expect(html).toContain("Needs connection");
  });

  it("links back to the current Editor and Project Dashboard", () => {
    const state = getPublishPreparationState("bright-studio", "content-operations", "content-workflow-map")!;
    const html = renderToStaticMarkup(<PublishPreparation state={state} />);

    expect(html).toContain('href="/workspaces/bright-studio/projects/content-operations/contents/content-workflow-map/edit"');
    expect(html).toContain('href="/workspaces/bright-studio/projects/content-operations"');
  });

  it("shows only the required no-publish notice when Publish is requested", () => {
    const initial = createPublishActionState();
    const afterPublish = showPublishUnavailableNotice();
    const html = renderToStaticMarkup(<PublishAction />);

    expect(initial.notice).toBeNull();
    expect(afterPublish.notice).toBe(publishUnavailableNotice);
    expect(afterPublish.notice).toBe("Publishing is not connected yet. No content was published.");
    expect(html).toContain("This preparation screen cannot publish content.");
    expect(html).toContain(">Publish</button>");
    expect(html).not.toContain("Successfully published");
  });

  it("has no sidebar and includes mobile, tablet, and desktop layout rules", () => {
    const state = getPublishPreparationState("bright-studio", "content-operations", "content-workflow-map")!;
    const html = renderToStaticMarkup(<PublishPreparation state={state} />);

    expect(html).not.toContain("<aside");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("sm:flex-row");
    expect(html).toContain("lg:grid-cols-[1.35fr_0.65fr]");
    expect(html).toContain("md:flex-row");
  });
});
