import { describe, expect, it } from "vitest";

import { evaluateApprovalDuplicateRisk } from "../../../../core/approval";
import type { ContentDocument } from "../../../../core/content";

function document(id: string, title: string, headings: readonly string[], paragraphs: readonly string[]): ContentDocument {
  return {
    id,
    title,
    blocks: [
      ...headings.map((text, index) => ({ id: `${id}-h-${index}`, type: "heading" as const, level: 2 as const, text })),
      ...paragraphs.map((text, index) => ({ id: `${id}-p-${index}`, type: "paragraph" as const, text })),
    ],
  };
}

describe("ApprovalDuplicatePolicy", () => {
  it("passes a manuscript with a distinct purpose and information structure", () => {
    const current = document(
      "current",
      "별이 빛나는 밤을 처음 보는 감상 순서",
      ["밤하늘의 소용돌이부터 관찰하기", "마을과 하늘의 대비 읽기", "감상을 기록하는 순서"],
      ["화면의 움직임을 따라 시선을 옮기는 방법을 설명합니다.", "밝기와 색의 대비가 만드는 정서를 구분합니다."],
    );
    const previous = document(
      "previous",
      "고흐의 생애와 대표작 정리",
      ["네덜란드에서 보낸 어린 시절", "프랑스 시기의 작품", "대표작 목록"],
      ["화가의 생애를 연대순으로 정리합니다.", "대표 작품의 제작 시기를 소개합니다."],
    );

    const result = evaluateApprovalDuplicateRisk(current, [{ contentId: "previous", document: previous }], "2026-07-27T00:00:00.000Z");

    expect(result.status).toBe("passed");
    expect(result.comparedContentIds).toEqual(["previous"]);
  });

  it("blocks a template clone with the same title, headings, and body value", () => {
    const current = document(
      "current",
      "작품 감상 가이드",
      ["작품의 색을 보는 순서", "구도를 보는 순서"],
      ["먼저 화면 중심의 색을 확인하고 주변 색과 비교합니다.", "다음으로 인물과 배경의 위치를 비교합니다."],
    );
    const duplicate = document(
      "duplicate",
      "작품 감상 가이드",
      ["작품의 색을 보는 순서", "구도를 보는 순서"],
      ["먼저 화면 중심의 색을 확인하고 주변 색과 비교합니다.", "다음으로 인물과 배경의 위치를 비교합니다."],
    );

    const result = evaluateApprovalDuplicateRisk(current, [{ contentId: "duplicate", document: duplicate }], "2026-07-27T00:00:00.000Z");

    expect(result.status).toBe("blocked");
    expect(result.matchedContentId).toBe("duplicate");
    expect(result.highestSimilarity).toBe(1);
    expect(result.reasons).toContainEqual(expect.stringContaining("제목"));
  });

  it("requires review when the heading flow is reused even if the title differs", () => {
    const current = document(
      "current",
      "모네 수련을 보는 세 단계",
      ["색을 보는 순서", "구도를 보는 순서", "감상을 기록하는 순서"],
      ["수면의 색 변화와 빛의 반사를 확인합니다.", "화면 가장자리와 중심의 균형을 비교합니다."],
    );
    const similar = document(
      "similar",
      "르누아르 작품 감상법",
      ["색을 보는 순서", "구도를 보는 순서", "감상을 기록하는 순서"],
      ["인물의 피부색과 배경색의 관계를 확인합니다.", "인물 배치와 시선 방향을 비교합니다."],
    );

    const result = evaluateApprovalDuplicateRisk(current, [{ contentId: "similar", document: similar }], "2026-07-27T00:00:00.000Z");

    expect(result.status).toBe("needs_review");
    expect(result.reasons).toContainEqual(expect.stringContaining("소제목"));
  });

  it("does not compare the current document with itself", () => {
    const current = document("current", "현재 글", ["현재 소제목"], ["현재 본문입니다."]);

    const result = evaluateApprovalDuplicateRisk(current, [{ contentId: "current", document: current }], "2026-07-27T00:00:00.000Z");

    expect(result.status).toBe("passed");
    expect(result.comparedContentIds).toEqual([]);
    expect(result.highestSimilarity).toBeUndefined();
  });
});
