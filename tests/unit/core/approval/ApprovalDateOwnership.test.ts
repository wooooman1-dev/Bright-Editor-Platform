import { describe, expect, it } from "vitest";

import {
  normalizeApprovalDateOwnership,
  resolveApprovalPolicySnapshot,
} from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

const policy = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;

function document(text: string): ContentDocument {
  return {
    id: "content-date",
    title: "날짜 역할 검증",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-02T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-02T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 10,
      approvalPolicy: policy,
    },
    blocks: [
      { id: "manuscript-date", type: "paragraph", text },
      {
        id: "approval-review-date",
        type: "paragraph",
        ownership: "system_source_projection",
        text: "출처 확인일: 2026-08-02 · Claim 최종 검토일: 2026-08-02",
      },
    ],
  };
}

describe("approval date ownership normalization", () => {
  it.each([
    "정보 기준일·최종 검토일은 2026년 8월 2일입니다.",
    "정보 기준일 및 최종 검토일은 2026년 8월 2일입니다.",
    "정보 기준일과 출처 확인일은 2026-08-02입니다.",
  ])("keeps only the manuscript-owned information date for %s", (text) => {
    const normalized = normalizeApprovalDateOwnership(document(text));
    expect(normalized.blocks[0]).toMatchObject({
      type: "paragraph",
      text: expect.stringContaining("정보 기준일은 2026"),
    });
    expect((normalized.blocks[0] as { text: string }).text).not.toMatch(/최종\s*검토일|출처\s*확인일/);
  });

  it("does not alter Bright Studio's system-owned source and Claim review dates", () => {
    const normalized = normalizeApprovalDateOwnership(document("정보 기준일·최종 검토일은 2026년 8월 2일입니다."));
    expect(normalized.blocks[1]).toEqual(document("").blocks[1]);
  });

  it("does not alter a non-WordPress approval profile", () => {
    const source = document("정보 기준일·최종 검토일은 2026년 8월 2일입니다.");
    const other = {
      ...source,
      metadata: {
        ...source.metadata!,
        approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", "tistory_vivarain_art_v1")!,
      },
    };
    expect(normalizeApprovalDateOwnership(other)).toBe(other);
  });
});
