import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PublicPostCatalogError } from "../../../../../app/application/publishing/PublicPostCatalogError";

describe("PublicPostCatalogError", () => {
  it("preserves platform-neutral failure details", () => {
    const error = new PublicPostCatalogError({
      platform: "wordpress",
      state: "session_expired",
      message: "워드프레스 연결을 다시 확인해 주세요.",
      remediation: "플랫폼 연결 설정을 확인해 주세요.",
      reconnectRequired: true,
    });

    expect(error).toMatchObject({
      name: "PublicPostCatalogError",
      platform: "wordpress",
      state: "session_expired",
      reconnectRequired: true,
      remediation: "플랫폼 연결 설정을 확인해 주세요.",
    });
  });

  it("keeps platform-specific workflow errors out of the shared API route", () => {
    const routeSource = readFileSync(join(
      process.cwd(),
      "app/api/publishing/posts/route.ts",
    ), "utf8");

    expect(routeSource).toContain("PublicPostCatalogError");
    expect(routeSource).not.toContain("TistoryPostWorkflowError");
    expect(routeSource).not.toContain("WordPress reconnect is required");
  });

  it("normalizes each platform inside its application service", () => {
    const tistorySource = readFileSync(join(
      process.cwd(),
      "app/application/publishing/TistoryPostCatalogApplicationService.ts",
    ), "utf8");
    const wordpressSource = readFileSync(join(
      process.cwd(),
      "app/application/publishing/WordPressPostCatalogApplicationService.ts",
    ), "utf8");

    expect(tistorySource).toContain("error instanceof TistoryPostWorkflowError");
    expect(tistorySource).toContain('platform: "tistory"');
    expect(wordpressSource).toContain('platform: "wordpress"');
    expect(wordpressSource).toContain("reconnectRequiredError");
  });
});
