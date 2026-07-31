import { describe, expect, it } from "vitest";

import {
  assertOpenAIResponseOwnedIdentityPolicy,
  readOwnedIdentityResponsePolicy,
} from "../../../../app/application/OpenAIProvider";
import { contentBoundEditorialContext } from "../../../../app/application/approval/ApprovalContentPolicy";
import type { UserContent } from "../../../../app/user-flow/user-data";

function canonicalInstruction(input: Readonly<{
  sourceRequest: string;
  selectionMode: "automatic" | "userSpecified";
}>): string {
  const context = JSON.stringify({
    projectStrategy: {
      projectIdentity: {
        projectName: "밝은재테크",
        brandName: "밝은재테크",
      },
    },
    ownedIdentityPolicy: input,
  });
  return [
    "Return a complete canonical ContentDocument.",
    "",
    "Canonical server editorial context (mandatory; do not ignore or override):",
    context,
    "",
    "Approval evidence search contract (mandatory):",
    "- Use direct official pages.",
  ].join("\n");
}

function content(overrides: Partial<UserContent> = {}): UserContent {
  return {
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "통장 쪼개기 방법",
    body: "",
    status: "planning",
    updatedAt: "2026-07-31T00:00:00.000Z",
    naturalLanguageRequest: "오늘의 생활경제 주제를 골라줘",
    planningWorkflow: {
      status: "opportunityConfirmed",
      request: "오늘의 생활경제 주제를 골라줘",
      selectionMode: "automatic",
      operationId: "operation-1",
      revision: 1,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("OpenAI owned identity response guard", () => {
  it("stores the immutable request mode and source request in canonical editorial context", () => {
    const serialized = contentBoundEditorialContext({
      projectIdentity: {
        projectName: "밝은재테크",
        brandName: "밝은재테크",
      },
    }, content());

    expect(JSON.parse(serialized)).toMatchObject({
      projectStrategy: {
        projectIdentity: {
          projectName: "밝은재테크",
          brandName: "밝은재테크",
        },
      },
      ownedIdentityPolicy: {
        sourceRequest: "오늘의 생활경제 주제를 골라줘",
        selectionMode: "automatic",
      },
    });
  });

  it("reads the canonical policy even when another prompt contract follows the JSON", () => {
    expect(readOwnedIdentityResponsePolicy(canonicalInstruction({
      sourceRequest: "통장 {역할}을 기준으로 주제를 골라줘",
      selectionMode: "automatic",
    }))).toEqual({
      ownedTerms: ["밝은재테크"],
      sourceRequest: "통장 {역할}을 기준으로 주제를 골라줘",
      selectionMode: "automatic",
    });
  });

  it.each([
    ["제목", JSON.stringify({ title: "밝은재테크 통장 쪼개기 방법", blocks: [] })],
    ["본문", JSON.stringify({ title: "통장 쪼개기 방법", blocks: [{ type: "paragraph", text: "밝은재테크 기준으로 계좌를 나눕니다." }] })],
    ["메타 설명", JSON.stringify({ title: "통장 쪼개기 방법", metaDescription: "밝은재테크 통장 관리 안내", blocks: [] })],
    ["이미지 대체 텍스트", JSON.stringify({ title: "통장 쪼개기 방법", blocks: [{ type: "image", alt: "밝은재테크 통장 구조", source: "" }] })],
    ["태그", JSON.stringify({ title: "통장 쪼개기 방법", tags: ["밝은재테크"], blocks: [] })],
  ])("blocks reinsertion in %s for automatic Planning", (_label, response) => {
    const instruction = canonicalInstruction({
      sourceRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 생활경제 주제를 골라줘",
      selectionMode: "automatic",
    });

    expect(() => assertOpenAIResponseOwnedIdentityPolicy(instruction, response))
      .toThrow("요청하지 않은 프로젝트명 또는 브랜드명이 다시 포함되어 결과 적용을 차단했습니다");
  });

  it("allows the owned identity only when userSpecified Planning explicitly selected it", () => {
    const instruction = canonicalInstruction({
      sourceRequest: "밝은재테크 통장 쪼개기 글을 작성해줘",
      selectionMode: "userSpecified",
    });
    const response = JSON.stringify({
      title: "밝은재테크 통장 쪼개기 방법",
      blocks: [],
    });

    expect(() => assertOpenAIResponseOwnedIdentityPolicy(instruction, response))
      .not.toThrow();
  });

  it("keeps clean editorial output unchanged", () => {
    const instruction = canonicalInstruction({
      sourceRequest: "오늘의 생활경제 주제를 골라줘",
      selectionMode: "automatic",
    });
    const response = JSON.stringify({
      title: "통장 쪼개기 방법",
      metaDescription: "목적별 계좌 역할과 자동이체 순서를 정리합니다.",
      tags: ["통장 쪼개기", "생활비 통장"],
      blocks: [{ type: "paragraph", text: "계좌 수보다 역할을 먼저 정합니다." }],
    });

    expect(() => assertOpenAIResponseOwnedIdentityPolicy(instruction, response))
      .not.toThrow();
  });

  it("does not apply the policy to calls without canonical editorial context", () => {
    expect(() => assertOpenAIResponseOwnedIdentityPolicy(
      "Analyze the content request as an editorial strategist.",
      JSON.stringify({ title: "밝은재테크 통장 쪼개기" }),
    )).not.toThrow();
  });
});