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

  /**
   * 2026-09-05 실측(content-mtnqhijd-f1m7e0): 고용노동부 1350 상담 출처
   * 4개가 서로 다른 URL(다른 답변)인데 title이 전부 ":: 고용노동부
   * 모바일페이지 고객센터 ::"로 동일한 SPA 화면이라, title에서 걷어낸 나머지도
   * 4개 다 같은 값이 되어 라벨이 구분되지 않았다. 답변 발췌로 넘어가도 이
   * 사이트 답변은 서로 다른 말로 같은 법 조항을 반복해 표현이 갈라지지 않으므로,
   * 최종적으로 순번으로 구분해야 한다.
   */
  it("falls back to the citation excerpt, then to a sequence number, when the title is a fixed site shell for every source", () => {
    const labels = approvalSourceLabels([
      {
        url: "https://1350.moel.go.kr/rtmview.do?id=1000059852",
        title: ":: 고용노동부 모바일페이지 고객센터 ::",
        excerpt: "고용노동부 1350모바일 상담입니다. 근로기준법 제55조제1항 등에 따라 주휴수당은 ①근로기준법상 근로자로서 …",
      },
      {
        url: "https://1350.moel.go.kr/rtmview.do?id=1000092981",
        title: ":: 고용노동부 모바일페이지 고객센터 ::",
        excerpt: "근로기준법 제55조제1항 및 같은법 시행령 제30조제1항에 따르면 사용자는 1주 소정근로일을 개근한 근로자에게 …",
      },
      {
        url: "https://1350.moel.go.kr/rtmview.do?id=1000304054",
        title: ":: 고용노동부 모바일페이지 고객센터 ::",
        excerpt: "가. 주휴수당은 - ①근로기준법상 근로자로서, ②4주 평균하여 1주 소정근로시간 …",
      },
      {
        url: "https://1350.moel.go.kr/rtmview.do?id=1000306709",
        title: ":: 고용노동부 모바일페이지 고객센터 ::",
        excerpt: "고용노동부 1350 모바일 상담입니다. 주휴수당은, ①근로기준법상 근로자로서 …",
      },
    ]);

    expect(new Set(labels).size).toBe(4);
    for (const label of labels) expect(label.startsWith("고용노동부 · ")).toBe(true);
  });

  it("uses the excerpt to distinguish same-institution sources whose titles collide but excerpts differ", () => {
    const labels = approvalSourceLabels([
      { url: "https://a.go.kr/1", title: "동일한 화면 제목", excerpt: "첫 번째 답변의 실제 내용입니다." },
      { url: "https://a.go.kr/2", title: "동일한 화면 제목", excerpt: "두 번째 답변의 실제 내용입니다." },
    ]);

    expect(labels).toEqual(["a.go.kr · 첫 번째 답변의 실제 내용입니다.", "a.go.kr · 두 번째 답변의 실제 내용입니다."]);
  });
});
