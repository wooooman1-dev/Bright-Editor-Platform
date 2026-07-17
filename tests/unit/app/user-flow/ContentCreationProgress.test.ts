import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/user-flow/ContentCreationFlow.tsx"), "utf8");

describe("ContentCreationFlow recommendation progress", () => {
  it("uses a dedicated regeneration operation without clearing the existing plan", () => {
    expect(source).toContain('type CreationOperation = "idle" | "planning" | "regenerating" | "generating";');
    expect(source).toContain('setOperation(regenerate ? "regenerating" : "planning")');
    expect(source).toContain('onClick={() => void analyze(false, true)}');
    expect(source).not.toContain("setPlan(undefined)");
  });

  it("shows persistent fixed progress and accurate regeneration copy", () => {
    expect(source).toContain('className="bright-operation-notice');
    expect(source).toContain("AI 추천을 다시 생성하고 있습니다.");
    expect(source).toContain("현재 추천은 그대로 유지됩니다. 완료된 뒤에만 새 추천으로 교체합니다.");
    expect(source).toContain('operation === "regenerating" ? "추천 생성 중…" : "추천 다시 생성"');
  });

  it("locks the recommendation controls while work is running", () => {
    expect(source).toContain('aria-busy={operation === "regenerating"}');
    expect(source).toContain('disabled={working} onChange={(event) => setKeyword(event.target.value)}');
    expect(source).toContain('disabled={working} key={candidate}');
    expect(source).toContain('checked={selected.includes(connection.id)} disabled={working}');
  });

  it("preserves the previous recommendation when regeneration fails", () => {
    expect(source).toContain("기존 추천은 그대로 유지되었습니다. 다시 시도할 수 있습니다.");
    expect(source).toContain("새 추천이 준비되었습니다. 변경된 키워드와 콘텐츠 방향을 확인해 주세요.");
  });
});
