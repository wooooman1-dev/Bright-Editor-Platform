import { describe, expect, it } from "vitest";

import { approvalSourceInstitutionName, approvalSourceLabels } from "../../../../core/approval";

describe("approval source institution names", () => {
  it("names the institution a public-sector host belongs to, including subdomains", () => {
    expect(approvalSourceInstitutionName("law.go.kr")).toBe("국가법령정보센터");
    expect(approvalSourceInstitutionName("1350.moel.go.kr")).toBe("고용노동부");
    expect(approvalSourceInstitutionName("www.gov.kr")).toBe("정부24");
    expect(approvalSourceInstitutionName("m.korea.kr")).toBe("대한민국 정책브리핑");
  });

  it("falls back to the host when the institution is unknown", () => {
    expect(approvalSourceInstitutionName("www.example.go.kr")).toBe("example.go.kr");
  });
});

describe("approval source labels", () => {
  /**
   * 2026-08-20 밝은재테크 실측: 출처 줄이 ":: 고용노동부 모바일페이지 고객센터 ::
   * · 1350.moel.go.kr" 로 나갔다. 독자가 확인해야 하는 것은 기관 하나다.
   */
  it("shows the institution alone when it appears once", () => {
    const labels = approvalSourceLabels([
      { url: "https://1350.moel.go.kr/rtmview.do?id=1", title: ":: 고용노동부 모바일페이지 고객센터 ::" },
      { url: "https://www.gov.kr/mw/AA020", title: "전입신고 | 민원안내 및 신청 | 정부24" },
    ]);

    expect(labels).toEqual(["고용노동부", "정부24"]);
  });

  it("adds the page name only when one institution supplies more than one source", () => {
    const labels = approvalSourceLabels([
      { url: "https://law.go.kr/lsLinkCommonInfo.do?a=1", title: "국가법령정보센터 | 조문정보" },
      { url: "https://law.go.kr/lsLinkCommonInfo.do?a=2", title: "국가법령정보센터 | 변경조문" },
      { url: "https://www.mohw.go.kr/asset", title: "자산형성지원사업 < 자활정책 < 복지 : 보건복지부" },
    ]);

    expect(labels).toEqual(["국가법령정보센터 · 조문정보", "국가법령정보센터 · 변경조문", "보건복지부"]);
  });

  it("keeps only the first segment of a title that trails the site's own menu path", () => {
    const labels = approvalSourceLabels([
      { url: "https://m.korea.kr/news/one", title: "청년내일저축계좌 신청 방법 - 정책뉴스 | 뉴스 | 대한민국 정책브리핑" },
      { url: "https://www.korea.kr/news/two", title: "청년내일저축계좌 접수 - 정책뉴스 | 뉴스 | 대한민국 정책브리핑" },
    ]);

    expect(labels).toEqual([
      "대한민국 정책브리핑 · 청년내일저축계좌 신청 방법",
      "대한민국 정책브리핑 · 청년내일저축계좌 접수",
    ]);
  });

  /** PDF 의 /Title 이 UTF-16 인데 바이트로 읽히면 뜻 없는 값이 남는다. */
  it("omits an unreadable title rather than showing decoded bytes", () => {
    const labels = approvalSourceLabels([
      { url: "https://law.go.kr/lbook/lbFileDownload.do?flExt=pdf", title: "þÿ È 1Ç¥ Í ÎY" },
      { url: "https://law.go.kr/lsLinkCommonInfo.do?a=1", title: "국가법령정보센터 | 조문정보" },
    ]);

    expect(labels).toEqual(["국가법령정보센터", "국가법령정보센터 · 조문정보"]);
  });
});
