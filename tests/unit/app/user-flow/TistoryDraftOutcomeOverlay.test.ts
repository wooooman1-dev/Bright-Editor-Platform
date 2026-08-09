import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const overlaySource = readFileSync(join(process.cwd(), "app/user-flow/TistoryDraftOutcomeOverlay.tsx"), "utf8");

describe("Tistory draft outcome overlay wiring", () => {
  it("mounts the outcome overlay once at the application root", () => {
    expect(layoutSource).toContain('import { TistoryDraftOutcomeOverlay } from "./user-flow/TistoryDraftOutcomeOverlay";');
    expect(layoutSource.match(/<TistoryDraftOutcomeOverlay \/>/g)).toHaveLength(1);
  });

  it("intercepts only the completed Draft save response and preserves the original response", () => {
    expect(overlaySource).toContain("const response = await originalFetch(input, init);");
    expect(overlaySource).toContain("response.clone().json()");
    expect(overlaySource).toContain("return response;");
  });

  it("uses the registered diagnostic action to reverify without another save", () => {
    expect(overlaySource).toContain("reverifyRequestBody(card.context)");
    expect(overlaySource).toContain("중복 임시글을 막기 위해 재확인 전에는 같은 원고를 다시 저장하지 않습니다.");
  });

  it("does not show stale backend failure details on a verified result", () => {
    expect(overlaySource).toContain('card.outcome.status === "verified" ? "" : outcomeDetail');
  });

  it("navigates a verified completion to the owning project", () => {
    expect(overlaySource).toContain('card.outcome.status === "verified"');
    expect(overlaySource).toContain("projectOutcomeDestination(card.context, window.location.href)");
    expect(overlaySource).toContain("window.location.assign");
  });
});
