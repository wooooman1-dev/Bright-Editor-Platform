import { describe, expect, it, vi } from "vitest";

import {
  E2EOperationTimeout,
  runOperationWithTerminalCleanup,
  waitForOperationTerminalState,
} from "../../e2e/bright-studio-operation-lifecycle";

describe("Bright Studio Playwright operation lifecycle", () => {
  it("keeps the browser lifecycle alive until delayed Planning success", async () => {
    const startedAt = Date.now();
    let reads = 0;
    let cleaned = false;
    const result = await runOperationWithTerminalCleanup({
      operation: "Planning",
      run: () => waitForOperationTerminalState({
        operation: "Planning",
        timeoutMs: 5_000,
        pollIntervalMs: 50,
        readState: async () => {
          reads += 1;
          return Date.now() - startedAt >= 2_000
            ? { status: "success", value: "completed" }
            : undefined;
        },
      }),
      cleanup: async () => { cleaned = true; },
    });
    expect(result).toEqual({ status: "success", value: "completed" });
    expect(reads).toBeGreaterThan(1);
    expect(cleaned).toBe(true);
  }, 10_000);

  it("waits for delayed failure and captures it before cleanup", async () => {
    const events: string[] = [];
    const result = await runOperationWithTerminalCleanup({
      operation: "Planning",
      run: async () => waitForOperationTerminalState({
        operation: "Planning",
        timeoutMs: 5_000,
        pollIntervalMs: 50,
        readState: async () => {
          events.push("read");
          return events.length >= 4
            ? { status: "failure", value: "terminal-error" }
            : undefined;
        },
      }),
      cleanup: async () => { events.push("cleanup"); },
    });
    expect(result).toEqual({ status: "failure", value: "terminal-error" });
    expect(events.at(-1)).toBe("cleanup");
  });

  it("reports E2E_TIMEOUT distinctly from a product failure", async () => {
    await expect(waitForOperationTerminalState({
      operation: "Planning",
      timeoutMs: 80,
      pollIntervalMs: 20,
      readState: async () => undefined,
    })).rejects.toBeInstanceOf(E2EOperationTimeout);
    try {
      await waitForOperationTerminalState({
        operation: "Planning",
        timeoutMs: 20,
        pollIntervalMs: 10,
        readState: async () => undefined,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "E2E_TIMEOUT" });
    }
  });

  it("never runs cleanup before a terminal state is observed", async () => {
    const cleanup = vi.fn(async () => undefined);
    let terminal = false;
    let reads = 0;
    await runOperationWithTerminalCleanup({
      operation: "Planning",
      run: async () => waitForOperationTerminalState({
        operation: "Planning",
        timeoutMs: 1_000,
        pollIntervalMs: 10,
        readState: async () => {
          reads += 1;
          terminal = reads >= 3;
          return terminal ? { status: "success", value: true } : undefined;
        },
      }),
      cleanup: async () => {
        expect(terminal).toBe(true);
        cleanup();
      },
    });
    expect(terminal).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
