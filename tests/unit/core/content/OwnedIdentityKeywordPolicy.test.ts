import { describe, expect, it } from "vitest";

import {
  findUnrequestedOwnedIdentityOccurrences,
  findUnrequestedOwnedIdentityPrefixes,
} from "../../../../core/content";

describe("owned Project identity keyword policy", () => {
  it("blocks a Project label prefixed to an automatic Planning keyword", () => {
    expect(findUnrequestedOwnedIdentityPrefixes({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 주제를 선정해줘",
      selectionMode: "automatic",
      values: ["밝은재테크 통장 쪼개기 방법", "밝은재테크 통장 쪼개기"],
    })).toEqual(["밝은재테크"]);
  });

  it("detects an unrequested identity anywhere in generated editorial output", () => {
    expect(findUnrequestedOwnedIdentityOccurrences({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "통장 쪼개기 방법을 작성해줘",
      selectionMode: "userSpecified",
      values: [
        "통장 쪼개기 방법",
        "이 글은 밝은재테크 독자를 위한 안내입니다.",
        "밝은재테크 통장 관리 이미지",
      ],
    })).toEqual(["밝은재테크"]);
  });

  it("keeps an owned label when the user explicitly selected it as the subject", () => {
    expect(findUnrequestedOwnedIdentityPrefixes({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "밝은재테크 통장 쪼개기 글을 작성해줘",
      selectionMode: "userSpecified",
      values: ["밝은재테크 통장 쪼개기 방법"],
    })).toEqual([]);
    expect(findUnrequestedOwnedIdentityOccurrences({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "밝은재테크 통장 쪼개기 글을 작성해줘",
      selectionMode: "userSpecified",
      values: ["밝은재테크 통장 쪼개기 방법"],
    })).toEqual([]);
  });

  it("does not block a third-party product name", () => {
    expect(findUnrequestedOwnedIdentityPrefixes({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "오늘의 생활경제 주제를 골라줘",
      selectionMode: "automatic",
      values: ["카카오뱅크 통장 쪼개기 방법"],
    })).toEqual([]);
  });
});
