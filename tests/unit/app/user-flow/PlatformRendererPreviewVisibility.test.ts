import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const editorSource = readFileSync(
  join(process.cwd(), "app/user-flow/EditorWorkspaceImplementation.tsx"),
  "utf8",
);
const routeSource = readFileSync(
  join(process.cwd(), "app/api/studio/route.ts"),
  "utf8",
);

describe("shared platform Renderer preview", () => {
  it("connects both WordPress and Tistory to the shared render-platform path", () => {
    expect(editorSource).toContain('action: "render-platform"');
    expect(editorSource).toContain("platform: activePlatform");
    expect(editorSource).toContain("플랫폼 미리보기");
    expect(editorSource).toContain("HTML 소스");
    expect(routeSource).toContain('body.action === "render-platform"');
    expect(routeSource).toContain("new WordPressHtmlRenderer().render(content.document)");
    expect(routeSource).toContain("new TistoryPublishingAdapter().prepare");
  });

  it("keeps Renderer HTML read-only and ContentDocument canonical", () => {
    expect(editorSource).toContain("HTML은 Canonical Source가 아닙니다.");
    expect(editorSource).not.toContain("setEditedHtml");
  });
});
