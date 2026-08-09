export type OperationTerminalState<T> = Readonly<{
  status: "success" | "failure";
  value: T;
}>;

export class E2EOperationTimeout extends Error {
  readonly code = "E2E_TIMEOUT";

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} did not reach a terminal state within ${timeoutMs}ms.`);
    this.name = "E2EOperationTimeout";
  }
}

export async function waitForOperationTerminalState<T>(input: Readonly<{
  operation: string;
  readState: () => Promise<OperationTerminalState<T> | undefined>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}>): Promise<OperationTerminalState<T>> {
  const timeoutMs = input.timeoutMs ?? 5 * 60_000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const state = await input.readState();
    if (state) return state;
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new E2EOperationTimeout(input.operation, timeoutMs);
}

export async function runOperationWithTerminalCleanup<T>(input: Readonly<{
  operation: string;
  run: () => Promise<T>;
  cleanup: () => Promise<void>;
}>): Promise<T> {
  try {
    return await input.run();
  } finally {
    await input.cleanup();
  }
}
