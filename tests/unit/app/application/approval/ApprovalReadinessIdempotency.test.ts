import { describe, expect, it, vi } from "vitest";

import { executeApprovalReadinessOnce } from "../../../../../app/application/approval/ApprovalReadinessApplicationService";

describe("approval readiness server idempotency", () => {
  it("coalesces two simultaneous requests with the same execution identity", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const task = vi.fn(async () => {
      await blocked;
      return { execution: "shared" } as never;
    });

    const first = executeApprovalReadinessOnce("content::revision::context::evidence", task);
    const second = executeApprovalReadinessOnce("content::revision::context::evidence", task);
    expect(first).toBe(second);
    expect(task).toHaveBeenCalledTimes(1);

    release();
    await expect(Promise.all([first, second])).resolves.toEqual([
      { execution: "shared" },
      { execution: "shared" },
    ]);
  });

  it("starts a new execution for a changed publishing context", async () => {
    const task = vi.fn(async () => ({ execution: "new-context" }) as never);
    await executeApprovalReadinessOnce("content::revision::context-a::evidence", task);
    await executeApprovalReadinessOnce("content::revision::context-b::evidence", task);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
