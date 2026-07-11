import type { BrowserContext } from "playwright";

import type {
  BrowserContextManager,
  BrowserSessionManager,
} from "../../../core/automation/browser";

type SessionManagerBoundary = Pick<BrowserSessionManager, "exists">;
type ContextManagerBoundary = Pick<BrowserContextManager, "create">;

export type TistoryStoredSessionContextDependencies = Readonly<{
  createContextManager: (
    storageStatePath: string,
  ) => ContextManagerBoundary;
  createSessionManager: (
    storageStatePath: string,
  ) => SessionManagerBoundary;
}>;

export type TistoryStoredSessionContextErrorCode =
  | "SESSION_INSPECTION_FAILED"
  | "CONTEXT_PREPARATION_FAILED";

export class TistoryStoredSessionContextError extends Error {
  constructor(
    message: string,
    readonly code: TistoryStoredSessionContextErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TistoryStoredSessionContextError";
  }
}

export type TistoryStoredSessionContextResult =
  | Readonly<{ status: "missing" }>
  | Readonly<{ context: BrowserContext; status: "prepared" }>;

export async function prepareTistoryStoredSessionContext(
  storageStatePath: string,
  dependencies: TistoryStoredSessionContextDependencies,
): Promise<TistoryStoredSessionContextResult> {
  const sessionManager = createSessionManager(storageStatePath, dependencies);

  try {
    if (!(await sessionManager.exists())) {
      return Object.freeze({ status: "missing" });
    }
  } catch (error) {
    throw createWorkflowError("SESSION_INSPECTION_FAILED", error);
  }

  try {
    const contextManager = dependencies.createContextManager(storageStatePath);
    const context = await contextManager.create();

    return Object.freeze({ context, status: "prepared" });
  } catch (error) {
    throw createWorkflowError("CONTEXT_PREPARATION_FAILED", error);
  }
}

function createSessionManager(
  storageStatePath: string,
  dependencies: TistoryStoredSessionContextDependencies,
): SessionManagerBoundary {
  try {
    return dependencies.createSessionManager(storageStatePath);
  } catch (error) {
    throw createWorkflowError("SESSION_INSPECTION_FAILED", error);
  }
}

function createWorkflowError(
  code: TistoryStoredSessionContextErrorCode,
  cause: unknown,
): TistoryStoredSessionContextError {
  const message =
    code === "SESSION_INSPECTION_FAILED"
      ? "Unable to inspect the Tistory stored session."
      : "Unable to prepare the Tistory stored session context.";

  return new TistoryStoredSessionContextError(message, code, { cause });
}
