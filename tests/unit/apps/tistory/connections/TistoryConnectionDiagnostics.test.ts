import { describe, expect, it } from "vitest";

// @ts-expect-error The registered worker is an executable JavaScript module without a TypeScript declaration.
import { classifyTistoryConnectionFailure } from "../../../../../apps/tistory/connections/tistory-connection-worker.mjs";

function tagged(code: string) { const error = new Error(code); return Object.assign(error, { connectionFailureCode: code }); }

describe("Tistory connection failure diagnostics", () => {
  it.each([
    [tagged("browser_backend_unavailable"), "backend", "browser_backend_unavailable"],
    [tagged("chromium_not_installed"), "chromium", "chromium_not_installed"],
    [tagged("browser_launch_failed"), "launch", "browser_launch_failed"],
    [new Error("Timeout 300000ms exceeded"), "login", "login_timeout"],
    [tagged("session_not_created"), "session", "session_not_created"],
    [new Error("access denied"), "navigate", "verification_failed"],
    [new Error("unexpected"), "backend", "unknown_error"],
  ])("classifies %s during %s as %s", (error, phase, expected) => {
    expect(classifyTistoryConnectionFailure(error, phase)).toMatchObject({ failureCode: expected, safeMessage: expect.any(String), remediation: expect.any(String) });
  });

  it("classifies the exact network failure reproduced on this machine", () => {
    expect(classifyTistoryConnectionFailure(new Error("page.goto: net::ERR_NETWORK_ACCESS_DENIED"), "navigate")).toMatchObject({ failureCode: "network_access_denied", safeMessage: "Tistory network access is blocked on this machine." });
  });
});
