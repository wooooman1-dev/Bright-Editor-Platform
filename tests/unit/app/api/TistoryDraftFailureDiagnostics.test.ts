import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(join(process.cwd(), "app/api/tistory/route.ts"), "utf8");
const serviceSource = readFileSync(join(process.cwd(), "app/application/publishing/TistoryDraftApplicationService.ts"), "utf8");

describe("Tistory Draft failure diagnostics", () => {
  it("returns safe failure details at the API boundary", () => {
    expect(routeSource).toContain('error: result.error ?? "Tistory 임시저장 작업을 완료하지 못했습니다."');
    expect(routeSource).toContain("failedStep: result.failedStep");
    expect(routeSource).toContain("diagnosticCode: failedRecord?.diagnosticCode");
    expect(routeSource).toContain("runtimeFailure: result.diagnostic?.runtimeFailure");
  });

  it("logs completed steps, save click evidence, and the hidden runtime failure", () => {
    expect(serviceSource).toContain("completedSteps: result.steps?.filter((step) => step.passed).map((step) => step.key)");
    expect(serviceSource).toContain("draftSaveClickCount: result.draftSaveClickCount ?? 0");
    expect(serviceSource).toContain("runtimeFailure: result.diagnostic?.runtimeFailure");
    expect(serviceSource).toContain("safeError: result.error");
  });
});
