import type { QualityCategory } from "./QualityEngine";

export const qualityDimensionWeights: Readonly<Record<QualityCategory, number>> = Object.freeze({
  searchIntent: 14,
  seo: 14,
  readability: 11,
  structure: 14,
  completeness: 16,
  usefulness: 14,
  htmlQuality: 10,
  imageStrategy: 7,
  internalLinks: 0,
  cta: 0,
  // 표시 전용 (D-050). 승인 판정과 검토 AI 호출 조건은 가중치가 0보다 큰 항목만 본다.
  // 이 두 지표는 정규식 계수라 오탐이 있고, 근거 발췌가 없는 원고는 검토 AI를 불러도
  // 수치를 채울 수 없다. 그래서 목록에 보이기만 하고 아무것도 막지 않는다.
  concreteness: 0,
  readerDeferral: 0,
  evidenceUse: 0,
  // 문장 종결어미(반말/존댓말) 검사. 정규식 판정이라 인용문·법령 원문에서 오탐이
  // 날 수 있어 표시 전용으로 둔다(2026-08-29 실측으로 만든 지표, 위와 같은 이유).
  formality: 0,
});
