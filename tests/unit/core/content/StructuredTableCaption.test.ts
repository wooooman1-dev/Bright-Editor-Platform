import { describe, expect, it } from "vitest";

import { normalizeStructuredTable } from "../../../../core/content";

describe("표에는 언제나 설명이 붙는다", () => {
  /**
   * 생성은 표를 문단 안의 마크다운으로 돌려주고, 마크다운 표에는 캡션을 실을
   * 자리가 없다. 캡션을 모델에게 요구할 방법이 없으므로 열에서 만들어 붙인다.
   */
  it("캡션이 없으면 비교 대상 열에서 만들어 붙인다", () => {
    const table = normalizeStructuredTable({
      headers: ["구분", "고정지출", "배분 가능 금액", "변동지출 한도", "저축액"],
      rows: [["고정지출 낮음", "90만 원", "190만 원", "130만 원", "60만 원"]],
    });
    expect(table?.caption).toBe("고정지출·배분 가능 금액·변동지출 한도·저축액 비교");
  });

  it("사람이 쓴 캡션은 그대로 둔다", () => {
    const table = normalizeStructuredTable({
      caption: "고정지출 수준별 월 예산 배분 예시",
      headers: ["구분", "고정지출"],
      rows: [["낮음", "90만 원"]],
    });
    expect(table?.caption).toBe("고정지출 수준별 월 예산 배분 예시");
  });

  it("열 이름이 길면 이름표를 늘어놓는 대신 개수로 줄인다", () => {
    const table = normalizeStructuredTable({
      headers: ["구분", "매우 긴 첫 번째 비교 항목 이름", "매우 긴 두 번째 비교 항목 이름", "매우 긴 세 번째 비교 항목 이름"],
      rows: [["가", "1", "2", "3"]],
    });
    expect(table?.caption).toBe("매우 긴 첫 번째 비교 항목 이름 외 2개 항목 비교");
  });

  it("첫 열밖에 없으면 그 열 이름을 쓴다", () => {
    const table = normalizeStructuredTable({ headers: ["확인 항목"], rows: [["가입 조건"]] });
    expect(table?.caption).toBe("확인 항목");
  });

  /**
   * 마크다운 표 파싱도 같은 함수를 지나므로, 생성이 실제로 돌려주는 모양에도
   * 설명이 붙는다. 캡션 없이 헤더와 행만 주는 경로가 그 경로다.
   */
  it("캡션 인자가 아예 없는 호출에도 설명이 붙는다", () => {
    const table = normalizeStructuredTable({
      headers: ["구분", "월 납입액", "총 이자"],
      rows: [["원리금균등", "298만 원", "757만 원"]],
    });
    expect(table?.caption).toBe("월 납입액·총 이자 비교");
  });
});
