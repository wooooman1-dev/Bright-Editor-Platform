import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());

describe("Approval source document server/client boundary", () => {
  it("keeps Node-only extraction out of browser-safe barrels", () => {
    const browserDocumentAdapter = readFileSync(resolve(root, "core/approval/ApprovalSourceDocumentAdapter.ts"), "utf8");
    const approvalBarrel = readFileSync(resolve(root, "core/approval/index.ts"), "utf8");
    const aiBarrel = readFileSync(resolve(root, "core/ai/index.ts"), "utf8");
    const serverAdapter = readFileSync(resolve(root, "core/approval/ApprovalSourceDocumentServerAdapter.ts"), "utf8");

    expect(browserDocumentAdapter).not.toContain('from "node:zlib"');
    expect(approvalBarrel).not.toContain("ApprovalSourceDocumentServerAdapter");
    expect(aiBarrel).not.toContain('export {\n  approvalSourcePreflightMaximumClaimsPerSource');
    expect(aiBarrel).not.toContain('export {\n  AIWorkflow');
    expect(serverAdapter).toContain('import "server-only"');
    expect(serverAdapter).toContain('from "node:zlib"');
  });
});
