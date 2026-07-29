import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PublishingExecutionRecord } from "../../../../core/publishing";
import {
  blocksWordPressDraftExecution,
  wordpressDraftOutcomePresentation,
} from "../../../../app/user-flow/wordpress-draft-ui";
import {
  canExecuteWordPressDraft,
  reduceWordPressDraftOverlayState,
  resetWordPressDraftOverlayState,
  wordpressDraftExecutionIdentityKey,
  type WordPressDraftExecutionIdentity,
} from "../../../../app/user-flow/wordpress-draft-overlay-state";
import type { WordPressDraftReadiness } from "../../../../app/application/publishing/WordPressDraftReadiness";

const layoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const overlaySource = readFileSync(join(process.cwd(), "app/user-flow/WordPressDraftOverlay.tsx"), "utf8");

describe("WordPress Draft execution and completion UI", () => {
  it("mounts one overlay and restores the current idempotent record from GET", () => {
    expect(layoutSource).toContain('import { WordPressDraftOverlay } from "./user-flow/WordPressDraftOverlay";');
    expect(layoutSource).toContain("<WordPressDraftOverlay />");
    expect(overlaySource).toContain("loadWordPressDraftState");
    expect(overlaySource).toContain('type: "readiness_resolved"');
  });

  it("requires final confirmation and readiness before calling create_draft", () => {
    expect(overlaySource).toContain("if (!executable) return");
    expect(overlaySource).toContain('action: "create_draft"');
    expect(overlaySource).toContain("finalConfirmation: true");
    expect(overlaySource).toContain("disabled={!executable}");
  });

  it.each([
    ["Content", { contentId: "content-b" }],
    ["Connection", { connectionId: "wordpress-b" }],
    ["Revision", { contentRevisionId: "rev-b" }],
  ] as const)("resets confirmation and remote state when %s Identity changes", (_label, change) => {
    const identity = executionIdentity();
    const ready = resolveReadiness(resetWordPressDraftOverlayState(identity));
    const confirmed = reduceWordPressDraftOverlayState(ready, {
      type: "confirm",
      identityKey: ready.identityKey,
      value: true,
    });
    expect(confirmed.finalConfirmation).toBe(true);

    const reset = resetWordPressDraftOverlayState({ ...identity, ...change }, confirmed.requestId);

    expect(reset).toMatchObject({
      readiness: undefined,
      record: undefined,
      finalConfirmation: false,
      notice: "",
      loading: true,
    });
    expect(canExecuteWordPressDraft(reset)).toBe(false);
  });

  it("ignores a late response from the previous Content Identity", () => {
    const first = resetWordPressDraftOverlayState(executionIdentity());
    const secondIdentity = { ...executionIdentity(), contentId: "content-b", contentRevisionId: "rev-b" };
    const second = resolveReadiness(resetWordPressDraftOverlayState(secondIdentity, first.requestId), record("verified"));

    const afterLateResponse = reduceWordPressDraftOverlayState(second, {
      type: "readiness_resolved",
      identityKey: first.identityKey,
      requestId: first.requestId,
      readiness: readiness(),
      record: record("unknown_result"),
    });

    expect(afterLateResponse).toBe(second);
    expect(afterLateResponse.record?.status).toBe("verified");
    expect(afterLateResponse.identityKey).toBe(wordpressDraftExecutionIdentityKey(secondIdentity));
  });

  it("keeps execution disabled until the new Readiness request completes", () => {
    const pending = resetWordPressDraftOverlayState(executionIdentity());
    const confirmedWhilePending = reduceWordPressDraftOverlayState(pending, {
      type: "confirm",
      identityKey: pending.identityKey,
      value: true,
    });
    expect(confirmedWhilePending.loading).toBe(true);
    expect(canExecuteWordPressDraft(confirmedWhilePending)).toBe(false);

    const resolved = resolveReadiness(confirmedWhilePending);
    expect(canExecuteWordPressDraft(resolved)).toBe(true);
  });

  it("restores an unknown_result warning even when Readiness is unavailable", () => {
    const initial = resetWordPressDraftOverlayState(executionIdentity());
    const restored = reduceWordPressDraftOverlayState(initial, {
      type: "readiness_resolved",
      identityKey: initial.identityKey,
      requestId: initial.requestId,
      record: record("unknown_result"),
      readinessError: "WordPress Draft readiness could not be verified.",
    });

    expect(restored.readiness).toBeUndefined();
    expect(restored.record?.status).toBe("unknown_result");
    expect(wordpressDraftOutcomePresentation(restored.record!)).toMatchObject({ tone: "warning", retryBlocked: true });
  });

  it("shows verified completion details and the manual WordPress checklist", () => {
    const presentation = wordpressDraftOutcomePresentation(record("verified"));
    expect(presentation).toMatchObject({ title: "WordPress 임시글 저장 완료", tone: "success", retryBlocked: false });
    expect(overlaySource).toContain("외부 Post ID");
    expect(overlaySource).toContain("실제 검증 체크리스트");
    expect(overlaySource).toContain("WordPress 관리자에서 확인");
  });

  it.each([
    ["cleanup_required", "WordPress Media 확인 필요"],
    ["unknown_result", "WordPress 결과를 확인할 수 없습니다"],
    ["verification_failed", "WordPress 외부 검증 실패"],
  ] as const)("blocks another click and gives a safe %s completion state", (status, title) => {
    const audit = record(status);
    expect(blocksWordPressDraftExecution(audit)).toBe(true);
    expect(wordpressDraftOutcomePresentation(audit)).toMatchObject({ title, retryBlocked: true });
  });
});

function executionIdentity(): WordPressDraftExecutionIdentity {
  return {
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-a",
    contentRevisionId: "rev-a",
    connectionId: "wordpress-a",
  };
}

function resolveReadiness(
  state: ReturnType<typeof resetWordPressDraftOverlayState>,
  restoredRecord?: PublishingExecutionRecord,
) {
  return reduceWordPressDraftOverlayState(state, {
    type: "readiness_resolved",
    identityKey: state.identityKey,
    requestId: state.requestId,
    readiness: readiness(),
    ...(restoredRecord ? { record: restoredRecord } : {}),
  });
}

function readiness(): WordPressDraftReadiness {
  return {
    ready: true,
    executable: false,
    checks: [],
    localImageCount: 0,
    categorySelection: { valid: true, source: "content", categoryIds: ["12"], categoryNames: ["Household"] },
  };
}

function record(status: PublishingExecutionRecord["status"]): PublishingExecutionRecord {
  return {
    schemaVersion: 1,
    id: "publishing-key",
    idempotencyKey: "publishing-key",
    workspaceId: "workspace-1",
    projectId: "project-1",
    contentId: "content-1",
    contentRevisionId: "rev-1",
    platformConnectionId: "wordpress-1",
    platform: "wordpress",
    workflow: "draft.create",
    status,
    stage: status === "verified" ? "complete" : "draft_verify",
    externalPostId: "501",
    verified: status === "verified",
    uploadedMedia: [{ assetId: "asset-1", externalMediaId: "91" }],
    cleanupRequired: status === "cleanup_required",
    verificationChecks: [],
    categoryIds: ["12"],
    categoryNames: ["Household"],
    localImageCount: 1,
    featuredImageAssigned: true,
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:01:00.000Z",
  };
}
