import { describe, expect, it } from "vitest";

import {
  editorialFormatOptionsFor,
  lifeEconomyEditorialFormatOptions,
} from "../../../../core/content";

describe("EditorialFormatOptions", () => {
  it("offers the life-economy shapes to the WordPress approval profile", () => {
    expect(editorialFormatOptionsFor("wordpress_life_economy_v1"))
      .toBe(lifeEconomyEditorialFormatOptions);
  });

  it.each([
    ["tistory_vivarain_art_v1"],
    [undefined],
  ])("offers nothing to %s rather than shapes its subject cannot support", (profileId) => {
    expect(editorialFormatOptionsFor(profileId)).toBeUndefined();
  });

  it("names every shape after a question the required article information answers", () => {
    expect(lifeEconomyEditorialFormatOptions.options.map((option) => option.id))
      .toEqual(["procedure", "eligibility", "criteria", "correction", "calculation"]);
  });

  /**
   * A Q&A skeleton fragments the conditions and procedure across answers and
   * fails the completeness requirement; an article-length invented persona
   * collides with the rule against generating unverified experience.
   */
  it("excludes the shapes the approval policy cannot support", () => {
    const ids = lifeEconomyEditorialFormatOptions.options.map((option) => option.id);

    expect(ids).not.toContain("faq");
    expect(ids).not.toContain("scenario");
  });

  it("tells Planning to choose by topic fit instead of rotating the list", () => {
    expect(lifeEconomyEditorialFormatOptions.rule).toContain("순번대로 돌려쓰지 말고");
    expect(lifeEconomyEditorialFormatOptions.rule).toContain("목록 밖의 형태를 써도 된다");
  });

  it("forbids inventing material to make a chosen shape fit", () => {
    expect(lifeEconomyEditorialFormatOptions.rule).toContain("없는 사례, 없는 오해, 확인되지 않은 수치를 만들지 않는다");
  });

  it("keeps the completeness requirement independent of the chosen shape", () => {
    expect(lifeEconomyEditorialFormatOptions.rule).toContain("완결성 기준은 그대로 충족한다");
  });

  it("keeps the comparison shape away from product-signup comparisons the policy defers", () => {
    const criteria = lifeEconomyEditorialFormatOptions.options.find((option) => option.id === "criteria");

    expect(criteria?.fitsWhen).toContain("금융상품 가입을 유도하는 비교에는 쓰지 않는다");
  });

  it("offers only openings that state something, since the answer may not be deferred", () => {
    expect(lifeEconomyEditorialFormatOptions.introStyles).toHaveLength(4);
    expect(lifeEconomyEditorialFormatOptions.introStyles.join(" ")).not.toContain("질문을 던져");
  });

  it("describes every option completely so none reaches the prompt half-specified", () => {
    for (const option of lifeEconomyEditorialFormatOptions.options) {
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.skeleton.length).toBeGreaterThan(0);
      expect(option.fitsWhen.length).toBeGreaterThan(0);
    }
  });
});
