import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/user-flow/ContentCreationFlow.tsx"), "utf8");
const confirmationSource = readFileSync(join(process.cwd(), "app/user-flow/PrimaryKeywordConfirmation.tsx"), "utf8");
const shellSource = readFileSync(join(process.cwd(), "app/user-flow/FirstRunExperience.tsx"), "utf8");

describe("ContentCreationFlow recommendation progress", () => {
  it("uses a dedicated regeneration operation without clearing the existing plan", () => {
    expect(source).toContain('type CreationOperation = "idle" | "planning" | "regenerating" | "generating";');
    expect(source).toContain('setOperation(regenerate ? "regenerating" : "planning")');
    expect(source).toContain('onClick={() => void analyze(false, true)}');
    const regeneration = source.slice(source.indexOf("const analyze"), source.indexOf("const confirm"));
    expect(regeneration).not.toContain("setPlan(undefined)");
  });

  it("shows persistent fixed progress and accurate regeneration copy", () => {
    expect(source).toContain('className="bright-operation-notice');
    expect(source).toContain("AI 추천을 다시 생성하고 있습니다.");
    expect(source).toContain("현재 추천은 그대로 유지됩니다. 완료된 뒤에만 새 추천으로 교체합니다.");
    expect(source).toContain('operation === "regenerating" ? "추천 생성 중…" : dirtyRequest ? "변경 내용으로 추천 다시 생성" : "추천 다시 생성"');
  });

  it("locks the recommendation controls while work is running or the request changed", () => {
    expect(source).toContain('aria-busy={operation === "regenerating"}');
    // Asserts the confirmation is locked, not the order of props around it.
    expect(source).toContain('<PrimaryKeywordConfirmation');
    expect(source).toContain('disabled={working || dirtyRequest}');
    expect(source).toContain('onCustomKeywordChange={setCustomKeyword}');
    expect(confirmationSource).toContain('fieldset className="mt-5 space-y-3" disabled={disabled}');
    expect(confirmationSource).toContain('disabled={!customKeywordSelected || disabled}');
    expect(source).toContain('checked={selected.includes(connection.id)} disabled={working}');
  });

  it("preserves the previous recommendation when regeneration fails", () => {
    expect(source).toContain("기존 추천은 그대로 유지되었습니다. 다시 시도할 수 있습니다.");
    expect(source).toContain("새 추천이 준비되었습니다. 변경된 키워드와 콘텐츠 방향을 확인해 주세요.");
  });

  it("hydrates a Content-bound workflow without automatically repeating the AI request", () => {
    expect(source).toContain("content?.planningWorkflow");
    expect(source).toContain("if (!automatic || automaticStartRef.current || content?.planningWorkflow) return;");
    expect(source).toContain("automaticStartRef.current = true;");
    expect(source).toContain("if (planningSubmissionRef.current) return;");
    expect(source).toContain("onRefresh().catch");
    expect(shellSource).toContain("screenFromLocation(next)");
    expect(shellSource).toContain('url.searchParams.set("contentId", screen.contentId)');
    expect(shellSource).toContain("content={activePlanningContent}");
  });

  it("allows navigation during Planning while retaining an explicit destructive cancel action", () => {
    expect(source).toContain('onClick={onBack} type="button">← 프로젝트 대시보드');
    expect(source).toContain("현재 작업 취소");
    expect(source).toContain('action: "delete-content"');
  });

  /**
   * 2026-08-28 실측: Planning 이 09:16:22 에 끝났는데 화면은 09:25 까지
   * "분석 중" 이었다. setTimeout 한 번은 서버가 1.2초 안에 끝낼 때만 맞는다.
   */
  it("keeps asking until the saved workflow leaves planning or generating", () => {
    expect(source).toContain("window.setInterval(() => {");
    expect(source).toContain("window.clearInterval(timer)");
    expect(source).not.toContain("window.setTimeout(() => {\n      void onRefresh()");
  });

});
