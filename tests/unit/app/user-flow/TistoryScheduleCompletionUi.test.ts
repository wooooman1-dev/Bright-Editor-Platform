import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tistory schedule completion UI", () => {
  const source = readFileSync(join(process.cwd(), "app/user-flow/TistoryScheduleOverlay.tsx"), "utf-8");
  const normalizedSource = source.replace(/\r\n/g, "\n");

  it("moves successful schedule results into an explicit completion state", () => {
    expect(normalizedSource).toContain('type ScheduleOutcome = "scheduled_verified" | "existing" | "scheduled_unverified"');
    expect(normalizedSource).toContain("setOutcome(nextOutcome)");
    expect(normalizedSource).toContain('outcome ? "예약 발행 처리 결과" : "예약 발행"');
    expect(normalizedSource).toContain('title: "Tistory 예약 발행이 완료되었습니다."');
    expect(normalizedSource).toContain('actionLabel: "완료"');
  });

  it("hides the registration form after completion and exposes a closing action", () => {
    expect(normalizedSource).toContain("{outcome && outcomePresentation ? <div");
    expect(normalizedSource).toContain("onClick={() => setOpen(false)}");
    expect(normalizedSource).toContain("{outcomePresentation.actionLabel}");
    expect(normalizedSource).toContain("if (!open || outcome || !context");
  });

  it("resets the completion state only when a new schedule flow is opened", () => {
    expect(normalizedSource).toContain('setNotice("예약 발행 정보를 불러오고 있습니다.");\n        setOutcome(undefined);\n        setOpen(true);');
  });
});
