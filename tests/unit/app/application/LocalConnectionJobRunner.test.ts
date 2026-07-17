import { describe, expect, it, vi } from "vitest";

import { LocalConnectionJobRunner } from "../../../../app/application/connections/LocalConnectionJobRunner";
import type { ConnectionJob } from "../../../../core/connections";

describe("LocalConnectionJobRunner", () => {
  it("finds the active job for a connection and clears it after completion", async () => {
    const runner = new LocalConnectionJobRunner(10_000);
    let release: (() => void) | undefined;
    const job: ConnectionJob = {
      connectionId: "connection-1",
      async run(report) {
        report("waiting_for_user", "Waiting for login.");
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    };

    const started = await runner.start(job);
    expect(runner.statusByConnection(job.connectionId)).toEqual(expect.objectContaining({
      id: started.id,
      connectionId: job.connectionId,
      state: "waiting_for_user",
    }));

    release?.();
    await vi.waitFor(() => {
      expect(runner.statusByConnection(job.connectionId)).toBeUndefined();
      expect(runner.status(started.id)?.state).toBe("completed");
    });
  });

  it("does not return a terminal job as active", async () => {
    const runner = new LocalConnectionJobRunner(10_000);
    const started = await runner.start({
      connectionId: "connection-2",
      async run() {},
    });

    await vi.waitFor(() => expect(runner.status(started.id)?.state).toBe("completed"));
    expect(runner.statusByConnection("connection-2")).toBeUndefined();
  });
});
