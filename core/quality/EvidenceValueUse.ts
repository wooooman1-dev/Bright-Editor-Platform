import type { ContentDocument } from "../content";
import { scalarValuesIn } from "./ContentConcreteness";

/**
 * 서버가 가져와 문서에 저장한 발췌의 수치 중, 원고가 실제로 쓴 비율.
 *
 * 2026-08-28 실측이 근거다. 옛 국민연금 원고는 발췌 1,216자에 60세·65세를 들고
 * 있으면서 본문 수치가 `10년` 하나였다. 근로장려금 원고는 같은 구조에서 26개를
 * 썼다. 가져온 근거를 원고가 쓰는지 보는 눈이 없으면 이 차이가 드러나지 않는다.
 *
 * 이 지표는 표시 전용이다 (D-051). 값 추출은 정규식이라 법령 호수, 페이지 UI 문구,
 * 기준 연도 같은 것이 섞인다 — 실측 39개 중 약 14개가 그런 값이었다. 방향을 보는
 * 값이지 합격 도장이 아니므로 가중치 0으로 들어가고 발행도 승인도 막지 않는다.
 */
export type EvidenceValueUseMeasurement = Readonly<{
  evidenceValues: number;
  ratio: number;
  unusedValues: readonly string[];
  usedValues: number;
}>;

/** 법령 공포번호와 호수. 독자가 쓸 값이 아니라 조문 참조다. */
const CITATION_NUMBER = /^\d+호$/u;

export function measureEvidenceValueUse(document: ContentDocument): EvidenceValueUseMeasurement {
  const excerpts = (document.metadata?.approvalEvidence?.sources ?? [])
    .map((source) => (typeof source.citationExcerpt === "string" ? source.citationExcerpt : ""))
    .filter((excerpt) => excerpt.trim())
    .join(" ");
  const evidence = [...new Set(scalarValuesIn(excerpts))].filter((value) => !CITATION_NUMBER.test(value));
  if (!evidence.length) {
    return Object.freeze({ evidenceValues: 0, ratio: 1, unusedValues: Object.freeze([]), usedValues: 0 });
  }
  const written = new Set(scalarValuesIn(documentValueText(document)));
  const unused = evidence.filter((value) => !written.has(value));
  return Object.freeze({
    evidenceValues: evidence.length,
    ratio: Number(((evidence.length - unused.length) / evidence.length).toFixed(3)),
    unusedValues: Object.freeze(unused),
    usedValues: evidence.length - unused.length,
  });
}

export function evidenceValueUseScore(measurement: EvidenceValueUseMeasurement): number {
  return Math.round(measurement.ratio * 100);
}

/**
 * 값이 실릴 수 있는 모든 블록을 본다.
 *
 * 문단만 세던 첫 측정은 표에 든 금액을 놓쳤다. 근로장려금 원고의 총소득 기준금액은
 * 표 안에 있어서 "본문에 없는 값" 으로 잘못 잡혔다.
 */
function documentValueText(document: ContentDocument): string {
  return document.blocks.flatMap((block) => {
    if (block.type === "paragraph" || block.type === "heading") return [block.text];
    if (block.type === "list") return [...block.items];
    if (block.type === "table") return [...block.headers, ...block.rows.flat()];
    return [];
  }).join(" ");
}
