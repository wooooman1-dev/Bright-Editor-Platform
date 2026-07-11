import type { BrowserContext } from "playwright";
import { describe, expect, it, vi } from "vitest";

import {
  prepareTistoryStoredSessionContext,
  TistoryStoredSessionContextError,
  type TistoryStoredSessionContextDependencies,
} from "../../../../../apps/tistory";

describe("prepareTistoryStoredSessionContext", () => {
  it("passes the explicit path to Core session preparation", async () => {
    const storageStatePath = "sessions/tistory.json";
    const dependencies = createDependencies(false);

    await prepareTistoryStoredSessionContext(storageStatePath, dependencies);

    expect(dependencies.createSessionManager).toHaveBeenCalledWith(
      storageStatePath,
    );
  });

  it("returns an immutable missing result without requesting a context", async () => {
    const dependencies = createDependencies(false);

    const result = await prepareTistoryStoredSessionContext(
      "sessions/missing.json",
      dependencies,
    );

    expect(result).toEqual({ status: "missing" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(dependencies.createContextManager).not.toHaveBeenCalled();
  });

  it("prepares and returns the exact context from available stored state", async () => {
    const context = { close: vi.fn() } as unknown as BrowserContext;
    const storageStatePath = "sessions/tistory.json";
    const dependencies = createDependencies(
      true,
      context,
    );

    const result = await prepareTistoryStoredSessionContext(
      storageStatePath,
      dependencies,
    );

    expect(dependencies.createContextManager).toHaveBeenCalledWith(
      storageStatePath,
    );
    expect(result).toEqual({ context, status: "prepared" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(context.close).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("authenticated");
    expect(result).not.toHaveProperty("validSession");
    expect(result).not.toHaveProperty("loggedIn");
  });

  it("normalizes Core session inspection failures predictably", async () => {
    const sessionError = new Error("inspection failed");
    const dependencies = {
      createContextManager: vi.fn(),
      createSessionManager: vi.fn(() => ({
        exists: vi.fn().mockRejectedValue(sessionError),
      })),
    } satisfies TistoryStoredSessionContextDependencies;

    const promise = prepareTistoryStoredSessionContext(
      "sessions/tistory.json",
      dependencies,
    );

    await expect(promise).rejects.toMatchObject({
      cause: sessionError,
      code: "SESSION_INSPECTION_FAILED",
      message: "Unable to inspect the Tistory stored session.",
      name: "TistoryStoredSessionContextError",
    });
    await expect(promise).rejects.toBeInstanceOf(
      TistoryStoredSessionContextError,
    );
    expect(dependencies.createContextManager).not.toHaveBeenCalled();
  });

  it("normalizes Core context preparation failures predictably", async () => {
    const contextError = new Error("context failed");
    const dependencies = createDependencies(true, undefined, contextError);

    const promise = prepareTistoryStoredSessionContext(
      "sessions/tistory.json",
      dependencies,
    );

    await expect(promise).rejects.toMatchObject({
      cause: contextError,
      code: "CONTEXT_PREPARATION_FAILED",
      message: "Unable to prepare the Tistory stored session context.",
      name: "TistoryStoredSessionContextError",
    });
  });
});

function createDependencies(
  exists: boolean,
  context = {} as BrowserContext,
  contextError?: Error,
): TistoryStoredSessionContextDependencies & {
  createContextManager: ReturnType<typeof vi.fn>;
  createSessionManager: ReturnType<typeof vi.fn>;
} {
  const create = contextError
    ? vi.fn().mockRejectedValue(contextError)
    : vi.fn().mockResolvedValue(context);
  const createSessionManager = vi.fn(() => ({
    exists: vi.fn().mockResolvedValue(exists),
  }));
  const createContextManager = vi.fn(() => ({ create }));

  return {
    createContextManager,
    createSessionManager,
  };
}
