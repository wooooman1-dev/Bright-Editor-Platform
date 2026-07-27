import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("app/user-flow/FirstRunExperience.tsx", "utf8").replace(/\r\n?/g, "\n");

const approvalCard = "<ProjectApprovalSettingsCard data={data} key={project.id} onPersist={onPersist} project={project} />";

describe("Project approval settings UI wiring", () => {
  it("renders the approval settings card in the real Project screen", () => {
    expect(source).toContain('import { ProjectApprovalSettingsCard } from "./ProjectApprovalSettingsCard";');
    expect(source).toContain(approvalCard);

    const strategyIndex = source.indexOf("프로젝트의 콘텐츠 전략을 사용합니다.");
    const approvalIndex = source.indexOf(approvalCard);
    const publishingIndex = source.indexOf("<PublishingTargetSelector data={data} onPersist={onPersist} project={project}");

    expect(strategyIndex).toBeGreaterThanOrEqual(0);
    expect(approvalIndex).toBeGreaterThan(strategyIndex);
    expect(publishingIndex).toBeGreaterThan(approvalIndex);
  });
});
