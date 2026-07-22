import { describe, expect, it } from "vitest";

import {
  expireTistorySession,
  isTistorySessionExpiredFailure,
} from "../../../../app/application/connections/TistorySessionState";
import type { PlatformConnection } from "../../../../core/connections";

const connection: PlatformConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-healthy",
  status: "connected",
  publicMetadata: {
    blogId: "bright-healthy",
    blogUrl: "https://bright-healthy.tistory.com",
    sessionStateAvailable: true,
  },
  secretReference: "tistory-session-connection-1",
  createdAt: "before",
  updatedAt: "before",
  lastVerifiedAt: "before",
  selectedAsDefault: false,
  version: 3,
};

describe("TistorySessionState", () => {
  it("detects session expiration from a failed workflow step", () => {
    expect(isTistorySessionExpiredFailure({
      failedStep: "editor_ready",
      steps: [{ passed: false, diagnosticCode: "session_expired" }],
    })).toBe(true);
  });

  it("does not treat unrelated workflow failures as session expiration", () => {
    expect(isTistorySessionExpiredFailure({
      failedStep: "body_verified",
      steps: [{ passed: false, diagnosticCode: "body_verification_failed" }],
    })).toBe(false);
  });

  it("persists an expired state without changing the connection identity", () => {
    const expiredAt = "2026-07-22T01:02:03.000Z";
    const expired = expireTistorySession(connection, expiredAt);

    expect(expired).toMatchObject({
      id: connection.id,
      workspaceId: connection.workspaceId,
      status: "expired",
      updatedAt: expiredAt,
      version: 4,
      publicMetadata: {
        blogId: "bright-healthy",
        sessionStateAvailable: false,
        failureCode: "session_expired",
        sessionExpiredAt: expiredAt,
      },
    });
    expect(expired.secretReference).toBeUndefined();
  });
});
