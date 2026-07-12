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

    expect(html).toContain("Bright Studio / 콘텐츠 운영 기반");
    expect(html).toContain("실용적인 콘텐츠 작업 흐름");
    expect(html).toContain("발행 준비 상태");
    expect(html).toContain("콘텐츠 선택");
    expect(html).toContain("초안 확인");
    expect(html).toContain("플랫폼 연결");
    expect(html).toContain("연결되지 않음");
    expect(html).toContain("발행 연결 준비 중");
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
    expect(afterPublish.notice).toBe("발행 기능은 아직 연결되지 않았습니다. 아직 어떤 콘텐츠도 발행되지 않았습니다.");
    expect(html).toContain("이 화면에서는 발행 준비 상태만 확인할 수 있습니다.");
    expect(html).toContain(">발행 연결 확인</button>");
    expect(html).not.toContain("발행 완료");
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
