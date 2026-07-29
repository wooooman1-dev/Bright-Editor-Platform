import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const wrapperSource = readFileSync(join(process.cwd(), "app/user-flow/TistoryPublishingOverlays.tsx"), "utf8");

describe("Tistory publishing overlay visibility", () => {
  it("mounts Tistory publishing controls through one platform-aware wrapper", () => {
    expect(layoutSource).toContain('import { TistoryPublishingOverlays } from "./user-flow/TistoryPublishingOverlays";');
    expect(layoutSource).toContain("<TistoryPublishingOverlays />");
    expect(wrapperSource).toContain("<TistoryDraftOutcomeOverlay />");
    expect(wrapperSource).toContain("<TistoryScheduleOverlay />");
  });

  it("hides all Tistory editor controls when Tistory is disabled", () => {
    expect(wrapperSource).toContain('enabledPlatforms.includes("tistory")');
    expect(wrapperSource).toContain("if (!tistoryEnabled) return null");
    expect(wrapperSource).toContain('query.get("view") === "editor"');
  });
});
