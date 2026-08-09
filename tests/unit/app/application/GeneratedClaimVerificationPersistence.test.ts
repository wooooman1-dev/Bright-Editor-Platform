import { describe, expect, it } from "vitest";

import { mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import type { UserData } from "../../../../app/user-flow/user-data";
import type { GeneratedClaimVerificationRecord, GeneratedFactualClaimInventoryRecord } from "../../../../core/approval";

const storedRecord: GeneratedClaimVerificationRecord = Object.freeze({
  schemaVersion: 1,
  verificationSnapshot: Object.freeze({
    verificationMode: "explicit" as const,
    claimDefinitionFingerprint: "claim-definition",
    sourceSnapshotFingerprint: "source-snapshot",
    results: Object.freeze([]),
    overallStatus: "not_required" as const,
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    verificationSnapshotFingerprint: "verification-snapshot",
  }),
  boundEditorialRevisionId: "rev-server",
  bindings: Object.freeze([]),
  verifiedClaimIds: Object.freeze([]),
  unverifiedDetectedCount: 0,
});

const clientForgedRecord: GeneratedClaimVerificationRecord = Object.freeze({
  ...storedRecord,
  boundEditorialRevisionId: "rev-client-forged",
});

function data(record: GeneratedClaimVerificationRecord | undefined, updatedAt: string, text: string): UserData {
  return Object.freeze({
    workspace: Object.freeze({ id: "workspace-1", name: "Studio" }),
    brands: Object.freeze([]),
    projects: Object.freeze([Object.freeze({
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt,
    })]),
    contents: Object.freeze([Object.freeze({
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: "검증 원고",
      body: text,
      status: "draft" as const,
      updatedAt,
      document: Object.freeze({
        id: "content-1",
        title: "검증 원고",
        blocks: Object.freeze([
          Object.freeze({ id: "p1", type: "paragraph" as const, text }),
        ]),
        metadata: Object.freeze({
          buttonCount: 0,
          createdAt: "2026-08-08T00:00:00.000Z",
          generator: "test",
          imageCount: 0,
          language: "ko",
          readingTime: 1,
          source: "test",
          updatedAt,
          version: 1,
          videoCount: 0,
          wordCount: 5,
          ...(record ? { generatedClaimVerification: record } : {}),
        }),
      }),
    })]),
    history: Object.freeze([]),
    mediaMetadata: Object.freeze([]),
    qualityReports: Object.freeze([]),
    publishingRecords: Object.freeze([]),
    scheduledPublishing: Object.freeze([]),
  });
}

describe("Generated Claim verification persistence", () => {
  it("preserves the server-owned factual inventory when a client write omits it", () => {
    const inventory: GeneratedFactualClaimInventoryRecord = Object.freeze({
      schemaVersion: 1,
      items: Object.freeze([Object.freeze({
        claimId: "claim-verify", origin: "generation" as const, risk: "verify" as const,
        surfaceText: "취소 처리와 청구 반영은 다른 단계일 수 있습니다.",
        statement: "취소 처리와 청구 반영은 다른 단계일 수 있습니다.", kind: "general" as const,
        normalizedValueJson: "{}", qualifiers: Object.freeze({}), locations: Object.freeze([{ kind: "block" as const, blockId: "p1" }]),
        disposition: "retained" as const, evidenceStatus: "verify_verified" as const,
        evidenceUrl: "https://www.fss.or.kr/card", evidenceExcerpt: "취소 처리와 청구 반영은 다른 단계일 수 있습니다.",
      })]),
      retainedClaimIds: Object.freeze(["claim-verify"]), removedClaimCount: 0,
    });
    const base = data(undefined, "2026-08-08T00:00:00.000Z", "취소 처리와 청구 반영은 다른 단계일 수 있습니다.");
    const current: UserData = Object.freeze({
      ...base,
      contents: Object.freeze([Object.freeze({
        ...base.contents[0]!,
        document: Object.freeze({
          ...base.contents[0]!.document!,
          metadata: Object.freeze({ ...base.contents[0]!.document!.metadata!, generatedFactualClaimInventory: inventory }),
        }),
      })]),
    });
    const incoming = data(undefined, "2026-08-08T01:00:00.000Z", "클라이언트 수정 본문");
    const merged = mergeUserDataSnapshot(current, incoming);
    expect(merged.contents[0]?.document?.metadata?.generatedFactualClaimInventory).toEqual(inventory);
  });

  it("preserves the server-owned verification record when a newer client write omits it", () => {
    const current = data(storedRecord, "2026-08-08T00:00:00.000Z", "현재 지원 금액은 50만원입니다.");
    const incoming = data(undefined, "2026-08-08T01:00:00.000Z", "본문을 사용자가 수정했습니다.");

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0]?.document?.metadata?.generatedClaimVerification).toEqual(storedRecord);
    expect(merged.contents[0]?.document?.blocks[0]).toMatchObject({ text: "본문을 사용자가 수정했습니다." });
  });

  it("does not allow a client write to replace the server-owned verification record", () => {
    const current = data(storedRecord, "2026-08-08T00:00:00.000Z", "현재 지원 금액은 50만원입니다.");
    const incoming = data(clientForgedRecord, "2026-08-08T01:00:00.000Z", "현재 지원 금액은 70만원입니다.");

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0]?.document?.metadata?.generatedClaimVerification).toEqual(storedRecord);
    expect(merged.contents[0]?.document?.metadata?.generatedClaimVerification?.boundEditorialRevisionId).toBe("rev-server");
  });
});
