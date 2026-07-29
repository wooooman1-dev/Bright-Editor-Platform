import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Tistory schedule completion UI", () => {
  const source = readFileSync(join(process.cwd(), "app/user-flow/TistoryScheduleOverlay.tsx"), "utf-8");

  it("moves successful schedule results into an explicit completion state", () => {
    expect(source).toContain('type ScheduleOutcome = "scheduled_verified" | "existing" | "scheduled_unverified"');
    expect(source).toContain("setOutcome(nextOutcome)");
    expect(source).toContain('outcome ? "예약 발행 처리 결과" : "예약 발행"');
    expect(source).toContain('title: "Tistory 예약 발행이 완료되었습니다."');
    expect(source).toContain('actionLabel: "완료"');
  });

  it("hides the registration form after completion and exposes a closing action", () => {
    expect(source).toContain("{outcome && outcomePresentation ? <div");
    expect(source).toContain("onClick={() => setOpen(false)}");
    expect(source).toContain("{outcomePresentation.actionLabel}");
    expect(source).toContain("if (!open || outcome || !context");
  });

  it("resets the completion state only when a new schedule flow is opened", () => {
    expect(source).toContain('setNotice("예약 발행 정보를 불러오고 있습니다.");\n        setOutcome(undefined);\n        setOpen(true);');
  });
});
