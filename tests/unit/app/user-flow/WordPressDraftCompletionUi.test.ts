import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { PublishingExecutionRecord } from "../../../../core/publishing";
import {
  blocksWordPressDraftExecution,
  wordpressDraftOutcomePresentation,
} from "../../../../app/user-flow/wordpress-draft-ui";
import {
  canExecuteWordPressDraft,
  canSubmitWordPressDraft,
  isWordPressCategorySelectionApplied,
  reduceWordPressDraftModalView,
  reduceWordPressDraftOverlayState,
  resetWordPressDraftOverlayState,
  wordpressCategorySelectionKey,
  wordpressDraftExecutionIdentityKey,
  type WordPressDraftExecutionIdentity,
} from "../../../../app/user-flow/wordpress-draft-overlay-state";
import { requestWordPressDraftCreation, type WordPressDraftRequest } from "../../../../app/user-flow/wordpress-draft-request";
import type { WordPressDraftReadiness } from "../../../../app/application/publishing/WordPressDraftReadiness";

const editorSource = readFileSync(join(process.cwd(), "app/user-flow/EditorWorkspace.tsx"), "utf8");
const overlaySource = readFileSync(join(process.cwd(), "app/user-flow/WordPressDraftOverlay.tsx"), "utf8");
const requestSource = readFileSync(join(process.cwd(), "app/user-flow/wordpress-draft-request.ts"), "utf8");

describe("WordPress Draft execution and completion UI", () => {
  it("mounts one editor-owned overlay and restores the current idempotent record from GET", () => {
    expect(editorSource).toContain('import { WordPressDraftOverlay } from "./WordPressDraftOverlay";');
    expect(editorSource).toContain("{wordpressEnabled ? <WordPressDraftOverlay");
    expect(overlaySource).toContain("loadWordPressDraftState");
    expect(overlaySource).toContain('type: "readiness_resolved"');
  });

  it("integrates account and Category preparation before Draft execution", () => {
    expect(overlaySource).toContain("WordPress 계정");
    expect(overlaySource).toContain("WordPress 카테고리");
    expect(overlaySource).toContain("/api/publishing/wordpress/categories");
    expect(overlaySource).toContain('method: "POST"');
    expect(overlaySource).toContain("카테고리 적용");
    expect(overlaySource).toContain("<strong>Draft Only</strong>");
  });

  it("animates the WordPress notice only while Category or execution work is running", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(overlaySource).toContain("const noticeLoading = categoryLoading || categorySaving || Boolean(executionLoading);");
    expect(overlaySource).toContain('executionLoading ? "WordPress Draft Readiness를 확인하고 있습니다."');
    expect(overlaySource).toContain('categoryLoading ? "WordPress 카테고리를 불러오고 있습니다."');
    expect(overlaySource).toContain("wordpress-draft-notice--loading");
    expect(css).toContain('[aria-live="polite"].wordpress-draft-notice::before');
    expect(css).toContain('[aria-live="polite"].wordpress-draft-notice--loading::before');
    expect(css).toContain('[aria-live="polite"].wordpress-draft-notice--loading::after');
  });

  it("keeps completion and readiness notices mounted without a loading class", () => {
    expect(overlaySource).toContain("WordPress 카테고리 적용 완료:");
    expect(overlaySource).toContain('result.record?.safeMessage ?? "WordPress 실행 결과를 저장했습니다."');
    expect(overlaySource).toContain('{notice ? <p aria-live="polite"');
    expect(overlaySource).not.toContain("setTimeout(() => setCategoryNotice");
  });

  it("leaves platform ownership to the Editor's canonical gate", () => {
    expect(editorSource).toContain("editorPublishingPlatformVisibility");
    expect(editorSource).toContain("{wordpressEnabled ? <WordPressDraftOverlay");
    expect(overlaySource).not.toContain('enabledPlatforms.includes("wordpress")');
    expect(overlaySource).not.toContain("window.setInterval");
    expect(overlaySource).not.toContain('fetch("/api/studio"');
  });

  it("requires final confirmation and readiness before calling create_draft", () => {
    expect(overlaySource).toContain("if (!executable) return");
    expect(requestSource).toContain('action: "create_draft"');
    expect(requestSource).toContain("finalConfirmation: true");
    expect(overlaySource).toContain("disabled={!executable}");
    expect(overlaySource.match(/void submit\(\)/g)).toHaveLength(1);
  });

  it("opens the preparation screen even when GET restores a verified record", () => {
    const execution = resolveReadiness(resetWordPressDraftOverlayState(executionIdentity()), record("verified"));
    const opened = reduceWordPressDraftModalView("previous_result", { type: "open" });

    expect(execution.record?.status).toBe("verified");
    expect(opened).toBe("preparation");
    expect(overlaySource).toContain("이전 저장 결과 보기");
    expect(overlaySource).toContain("준비 화면으로 돌아가기");
  });

  it("shows a restored completion card only after the explicit previous-result action", () => {
    const opened = reduceWordPressDraftModalView("execution_result", { type: "open" });
    const restored = reduceWordPressDraftModalView(opened, { type: "show_previous_result", hasRecord: true });

    expect(opened).toBe("preparation");
    expect(restored).toBe("previous_result");
    expect(reduceWordPressDraftModalView(opened, { type: "show_previous_result", hasRecord: false })).toBe("preparation");
  });

  it.each([
    ["final confirmation", { confirmed: false }],
    ["Category application", { categorySelectionApplied: false }],
    ["latest Readiness", { readinessReady: false }],
  ] as const)("sends zero POST requests without %s", async (_label, override) => {
    const request = vi.fn<WordPressDraftRequest>();

    await expect(requestWordPressDraftCreation(submissionGuard(override), request)).resolves.toBeUndefined();
    expect(request).not.toHaveBeenCalled();
  });

  it("sends zero POST requests while opening preparation and previous-result views", () => {
    const request = vi.fn<WordPressDraftRequest>();
    const opened = reduceWordPressDraftModalView("previous_result", { type: "open" });
    const previous = reduceWordPressDraftModalView(opened, { type: "show_previous_result", hasRecord: true });

    expect(opened).toBe("preparation");
    expect(previous).toBe("previous_result");
    expect(request).not.toHaveBeenCalled();
  });

  it("sends exactly one create_draft POST from an explicitly executable save action", async () => {
    const request = vi.fn<WordPressDraftRequest>().mockResolvedValue(new Response(JSON.stringify({
      result: { record: record("verified"), readiness: readiness() },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await requestWordPressDraftCreation(submissionGuard(), request);

    expect(result?.record?.status).toBe("verified");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/publishing/wordpress", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(request.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      action: "create_draft",
      workspaceId: "workspace-1",
      projectId: "project-1",
      contentId: "content-a",
      connectionId: "wordpress-a",
      finalConfirmation: true,
    });
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

  it("invalidates Readiness and confirmation when the selected Category changes", () => {
    const ready = resolveReadiness(resetWordPressDraftOverlayState(executionIdentity()), record("verified"));
    const confirmed = reduceWordPressDraftOverlayState(ready, {
      type: "confirm",
      identityKey: ready.identityKey,
      value: true,
    });
    const changed = reduceWordPressDraftOverlayState(confirmed, {
      type: "preparation_changed",
      identityKey: confirmed.identityKey,
    });

    expect(changed).toMatchObject({
      readiness: undefined,
      record: undefined,
      finalConfirmation: false,
      loading: false,
      requestId: confirmed.requestId + 1,
    });
    expect(canExecuteWordPressDraft(changed)).toBe(false);

    const late = reduceWordPressDraftOverlayState(changed, {
      type: "readiness_resolved",
      identityKey: changed.identityKey,
      requestId: confirmed.requestId,
      readiness: readiness(),
    });
    expect(late).toBe(changed);
  });

  it("requires the selected and persisted Category sets to match", () => {
    expect(wordpressCategorySelectionKey(["12", " 7 ", "12"])).toBe("12|7");
    expect(isWordPressCategorySelectionApplied(["12"], ["12"])).toBe(true);
    expect(isWordPressCategorySelectionApplied(["12", "7"], ["7", "12"])).toBe(true);
    expect(isWordPressCategorySelectionApplied(["13"], ["12"])).toBe(false);
    expect(isWordPressCategorySelectionApplied([], [])).toBe(false);
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

function submissionGuard(override: Readonly<{
  confirmed?: boolean;
  categorySelectionApplied?: boolean;
  readinessReady?: boolean;
}> = {}) {
  const identity = executionIdentity();
  const initial = resetWordPressDraftOverlayState(identity);
  const resolved = reduceWordPressDraftOverlayState(initial, {
    type: "readiness_resolved",
    identityKey: initial.identityKey,
    requestId: initial.requestId,
    readiness: { ...readiness(), ready: override.readinessReady ?? true },
  });
  const executionState = reduceWordPressDraftOverlayState(resolved, {
    type: "confirm",
    identityKey: resolved.identityKey,
    value: override.confirmed ?? true,
  });
  const guard = {
    identity,
    executionState,
    categorySelectionApplied: override.categorySelectionApplied ?? true,
    readinessMatchesAppliedCategory: true,
    categoryLoading: false,
    categorySaving: false,
  } as const;
  expect(canSubmitWordPressDraft(guard)).toBe((override.confirmed ?? true)
    && (override.categorySelectionApplied ?? true)
    && (override.readinessReady ?? true));
  return guard;
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
