import { describe, expect, it } from "vitest";
import { assertProjectIdentityMutation } from "../../../../app/application/ProjectIdentityPersistenceStore";
import type { UserData, UserProject } from "../../../../app/user-flow/user-data";

const project = (id: string, name: string): UserProject => ({
  id,
  workspaceId: "workspace",
  name,
  description: "",
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
});

const data = (projects: readonly UserProject[]): UserData => ({ brands: [], projects, contents: [] });

describe("ProjectIdentityPersistenceStore", () => {
  it("blocks a new duplicate Project name after Unicode and whitespace normalization", () => {
    const current = data([project("health", "건강 정보")]);
    const candidate = data([project("health", "건강 정보"), project("duplicate", "  건강   정보 ")]);
    expect(() => assertProjectIdentityMutation(current, candidate)).toThrow("동일한 Project 이름을 중복 저장할 수 없습니다");
  });

  it("blocks a rename that introduces a duplicate name", () => {
    const current = data([project("health", "건강정보"), project("finance", "밝은재테크")]);
    const candidate = data([project("health", "건강정보"), project("finance", " 건강정보 ")]);
    expect(() => assertProjectIdentityMutation(current, candidate)).toThrow("동일한 Project 이름을 중복 저장할 수 없습니다");
  });

  it("allows an existing legacy duplicate set to persist unchanged until verified merge", () => {
    const current = data([project("health", "건강정보"), project("legacy", " 건강정보 ")]);
    const candidate = data([project("health", "건강정보"), project("legacy", " 건강정보 ")]);
    expect(() => assertProjectIdentityMutation(current, candidate)).not.toThrow();
  });

  it("allows the duplicate set to be reduced by a merge", () => {
    const current = data([project("health", "건강정보"), project("legacy", " 건강정보 ")]);
    const candidate = data([project("health", "건강정보")]);
    expect(() => assertProjectIdentityMutation(current, candidate)).not.toThrow();
  });

  it("blocks duplicate Project IDs independently of names", () => {
    const candidate = data([project("same", "건강정보"), project("same", "밝은재테크")]);
    expect(() => assertProjectIdentityMutation(undefined, candidate)).toThrow("동일한 Project ID를 중복 저장할 수 없습니다");
  });
});
