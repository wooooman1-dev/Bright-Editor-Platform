import { describe, expect, it } from "vitest";

import { officialSourceAllowed } from "../../../../core/approval";

describe("KDIC official Evidence", () => {
  it("accepts the Korea Deposit Insurance Corporation HTTPS domain", () => {
    expect(officialSourceAllowed("wordpress_life_economy_v1", {
      requestedUrl: "https://www.kdic.or.kr/deposit/selectProtectingProducts.do",
      finalUrl: "https://www.kdic.or.kr/deposit/selectProtectingProducts.do",
      status: 200,
      contentType: "text/html; charset=utf-8",
      title: "예금자보호제도",
      publisher: "예금보험공사",
      text: "예금자보호 대상과 보호 한도를 안내합니다.".repeat(20),
    })).toBe(true);
  });
});
