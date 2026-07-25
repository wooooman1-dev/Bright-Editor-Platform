import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-draft-worker.mjs"),
  "utf8",
);

describe("Tistory body verification diagnostic contract", () => {
  it("preserves the rendered diagnostic when fillHtmlBody fails", () => {
    expect(workerSource).toContain("if (body.diagnostic) verificationEvidence = body.diagnostic");
  });

  it("classifies the basic-mode rendered failure with semantic evidence", () => {
    expect(workerSource).toContain("code: structureDiagnosticCode(rendered.diagnostic)");
    expect(workerSource).toContain("diagnostic: rendered.diagnostic");
  });

  it("does not collapse the rendered mismatch to the generic diagnostic", () => {
    expect(workerSource).not.toContain(
      'if (!rendered.passed) return { passed: false, failedStep: "body_verified", code: "body_verification_failed"',
    );
  });
});
