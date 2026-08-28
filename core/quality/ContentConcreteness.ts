import type { ContentDocument } from "../content";

/**
 * 원고가 독자에게 실제로 답을 주는지 재는 두 지표.
 *
 * 2026-08-28 실측이 이 모듈을 만든 이유다. 발행된 원고 13편이 모두 완결성 100,
 * 유용성 100, 검색의도 100을 받았는데 그중 7편은 본문에 확인 가능한 수치가 하나도
 * 없었다. 같은 척도에서 근로장려금 원고는 21개였다. 100점이 13번 중 13번 나오는
 * 지표는 구별력이 0이고, 그 상태에서는 무엇을 고쳐도 좋아졌는지 알 수 없다.
 *
 * 두 지표는 정규식 계수다. 정당한 안내 문장도 떠넘김으로 셀 수 있으므로 방향을
 * 보는 용도이지 합격 도장이 아니다. 그래서 가중치 0으로 들어가고 발행도, 검토 AI
 * 호출 조건도 건드리지 않는다 (D-050).
 */
export type ContentConcretenessMeasurement = Readonly<{
  concreteFacts: number;
  concretePerThousand: number;
  deferralExamples: readonly string[];
  deferrals: number;
  proseCharacters: number;
}>;

/** 단위가 붙은 수치와 명시된 날짜만 센다. '1단계', '세 가지' 같은 서술 표현은 제외한다. */
// 날짜는 '일'과 '년'이 이미 잡는다. 따로 세면 '5월 1일'이 두 번 계산된다.
const FACT_PATTERN = /\d[\d,.]*\s*(?:원|만원|억원|억|만|퍼센트|%|년|개월|주|일|시간|분|세|회|번째|배|명|건|점|등급|호|㎡|평)/g;

/**
 * 답을 독자 밖으로 넘기는 문장. 창구·자료를 가리키면서 확인·조회·문의를 시키는 형태만
 * 잡고, 본문 안에서 조건을 확인하라는 서술은 세지 않는다.
 */
const DEFERRAL_TARGET = /홈페이지|누리집|사이트|앱에서|고객센터|상담|문의|공고|안내문|안내를|공지|창구|지사|주민센터|콜센터/;
const DEFERRAL_ACTION = /확인|조회|문의|알아보|신청해|접수해/;
const DIRECT_DEFERRAL = /직접 확인|반드시 확인|따로 확인|미리 확인해|확인하시기 바랍니다/;

export function measureContentConcreteness(document: ContentDocument): ContentConcretenessMeasurement {
  const prose = document.blocks
    .filter((block): block is Extract<ContentDocument["blocks"][number], { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.text)
    .join("\n");
  const proseCharacters = prose.replace(/\s/g, "").length;
  const concreteFacts = prose.match(FACT_PATTERN)?.length ?? 0;
  const sentences = prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const deferring = sentences.filter((sentence) =>
    DIRECT_DEFERRAL.test(sentence) || (DEFERRAL_TARGET.test(sentence) && DEFERRAL_ACTION.test(sentence)));
  return Object.freeze({
    concreteFacts,
    concretePerThousand: proseCharacters ? Number((concreteFacts / proseCharacters * 1000).toFixed(2)) : 0,
    deferralExamples: Object.freeze(deferring.slice(0, 2).map((sentence) => sentence.length > 60 ? `${sentence.slice(0, 60)}…` : sentence)),
    deferrals: deferring.length,
    proseCharacters,
  });
}

/** 1,000자당 3개를 만점으로 본다. 근로장려금 원고가 7.34, 발행된 원고의 절반이 0이었다. */
export const concretenessTarget = 3;

export function concretenessScore(measurement: ContentConcretenessMeasurement): number {
  if (!measurement.proseCharacters) return 0;
  return Math.max(0, Math.min(100, Math.round(measurement.concretePerThousand / concretenessTarget * 100)));
}

export function readerDeferralScore(measurement: ContentConcretenessMeasurement): number {
  return Math.max(0, Math.min(100, 100 - measurement.deferrals * 8));
}
