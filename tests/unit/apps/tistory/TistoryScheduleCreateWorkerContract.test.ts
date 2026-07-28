import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-schedule-create-worker.mjs"),
  "utf8",
);

describe("Tistory schedule create worker contract", () => {
  it("uses the dedicated native schedule controls and never delegates to the Draft worker", () => {
    expect(source).toContain('page.locator("#publish-layer-btn")');
    expect(source).toContain('input[name="basicSet"][value="20"]');
    expect(source).toContain('page.locator("button.btn_reserve")');
    expect(source).toContain('page.locator("#dateHour")');
    expect(source).toContain('page.locator("#dateMinute")');
    expect(source).toContain('page.locator("#publish-btn")');
    expect(source).toContain('.box_calendar strong.txt_calendar');
    expect(source).toContain('.box_calendar button.btn_next');
    expect(source).toContain('.box_calendar button.btn_prev');
    expect(source).toContain('.box_calendar table.tbl_calendar .btn_day');
    expect(source).not.toContain("tistory-draft-worker");
    expect(source).not.toContain("draft.create");
    expect(source).not.toMatch(/임시저장[\s\S]*\.click\s*\(/);
  });

  it("uses the existing same-editor Tistory media and tag integration before opening the publication panel", () => {
    expect(source).toContain('import { fillTistoryTags } from "./tistory-tags.mjs"');
    const mediaIndex = source.indexOf("const tags = await fillTistoryTags");
    const panelIndex = source.indexOf('page.locator("#publish-layer-btn")');
    expect(mediaIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeGreaterThan(mediaIndex);
    expect(source).toContain('tags.code ?? "tag_or_media_input_failed"');
    expect(source).not.toContain("async function fillTags");
  });

  it("verifies editor mode from the actual CodeMirror and TinyMCE state instead of the mode-button label alone", () => {
    expect(source).toContain("async function editorModeEvidence");
    expect(source).toContain("const htmlEditorReady = htmlEditors.some");
    expect(source).toContain("const basicEditorReady = basicEditor.editorAvailable && basicEditor.visible && !htmlEditorReady");
    expect(source).toContain('const passed = targetMode === "HTML" ? htmlEditorReady : basicEditorReady');
    expect(source).toContain("const transitionState = await waitForEditorModeState");
    expect(source).not.toContain("if (label.includes(targetMode)) return;");
  });

  it("verifies the selected reservation date and time before the single final registration click", () => {
    const verifyIndex = source.indexOf("const reservationEvidence = await verifyReservationState");
    const finalClickIndex = source.indexOf("await finalButton.click");
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(finalClickIndex).toBeGreaterThan(verifyIndex);
    expect(source.match(/await finalButton\.click\s*\(/g) ?? []).toHaveLength(1);
    expect(source).toContain('if (!/공개\\s*발행/.test(finalLabel))');
    expect(source).toContain("reservationEvidence.passed");
  });

  it("never automatically retries the final click and preserves ambiguous outcomes as unverified", () => {
    const finalClickIndex = source.indexOf("await finalButton.click");
    const afterFinalClick = source.slice(finalClickIndex);
    expect(afterFinalClick.match(/await finalButton\.click\s*\(/g) ?? []).toHaveLength(1);
    expect(afterFinalClick).not.toMatch(/for\s*\([^)]*\)[\s\S]{0,500}await finalButton\.click/);
    expect(afterFinalClick).not.toMatch(/while\s*\([^)]*\)[\s\S]{0,500}await finalButton\.click/);
    expect(source).toContain('status: "scheduled_unverified"');
    expect(source).toContain("자동 재시도하지 않습니다");
    expect(source).toContain('finalClickIssued ? "scheduled_unverified" : "failed"');
  });

  it("requires external title, reservation, and schedule evidence before reporting verified", () => {
    expect(source).toContain("evidence.titleMatched && evidence.reservationMatched && evidence.scheduleMatched");
    expect(source).toContain('status: "scheduled_verified"');
    expect(source).toContain("verifiedAt: new Date().toISOString()");
    expect(source).toContain("/manage/posts/");
  });
});
