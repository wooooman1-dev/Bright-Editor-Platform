import { describe, expect, it } from "vitest";
import { opportunityTopicGroupsOf, sharesOpportunityTopicGroup } from "../../../../core/intelligence";

/**
 * D-047. 2026-08-19 밝은재테크 실측 재현: 등록 키워드 예금·적금·월세·전세와
 * 실제 후보 주제가 문자열로 겹치지 않아 매칭이 0건이었다.
 */
describe("Opportunity topic groups", () => {
  it("matches a finance topic to a registered keyword that shares no substring", () => {
    expect(sharesOpportunityTopicGroup(["연금저축", "irp", "계좌"], ["적금"])).toBe(true);
    expect(sharesOpportunityTopicGroup(["전입신고", "확정일자", "임대차"], ["월세"])).toBe(true);
    expect(sharesOpportunityTopicGroup(["전입신고", "확정일자", "임대차"], ["전세"])).toBe(true);
  });

  it("keeps unrelated subject areas apart", () => {
    expect(sharesOpportunityTopicGroup(["연금저축", "irp"], ["실업급여"])).toBe(false);
    expect(sharesOpportunityTopicGroup(["전입신고", "확정일자"], ["통신비"])).toBe(false);
    expect(sharesOpportunityTopicGroup(["장", "건강"], ["대출"])).toBe(false);
  });

  it("returns no match when either side belongs to no known group", () => {
    expect(sharesOpportunityTopicGroup(["미분류주제"], ["예금"])).toBe(false);
    expect(sharesOpportunityTopicGroup(["예금"], ["미분류주제"])).toBe(false);
    expect(opportunityTopicGroupsOf(["미분류주제"]).size).toBe(0);
  });

  it("resolves a compound term through every base member it contains", () => {
    expect([...opportunityTopicGroupsOf(["전세자금대출"])].sort()).toEqual(["housing", "loan"]);
    expect([...opportunityTopicGroupsOf(["퇴직연금"])]).toEqual(["retirement"]);
  });

  it("does not pull a short term into a longer member's group", () => {
    expect([...opportunityTopicGroupsOf(["전세"])]).toEqual(["housing"]);
  });

  it("normalizes case and punctuation before resolving membership", () => {
    expect([...opportunityTopicGroupsOf(["IRP"])]).toEqual(["retirement"]);
    expect([...opportunityTopicGroupsOf(["연금·저축"])]).toEqual(expect.arrayContaining(["retirement", "savings"]));
  });

  it("is deterministic for the same terms", () => {
    const first = [...opportunityTopicGroupsOf(["연금저축", "월세"])];
    const second = [...opportunityTopicGroupsOf(["연금저축", "월세"])];
    expect(first).toEqual(second);
  });
});
