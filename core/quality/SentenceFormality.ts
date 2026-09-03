import type { ContentDocument } from "../content";

/**
 * 본문 문장이 존댓말 종결어미로 끝나는지 잰다.
 *
 * 2026-08-29 실측이 이 모듈을 만든 이유다. 프롬프트에 "Write polite, natural
 * Korean" 이 있지만 이를 검증하는 코드가 core/quality 어디에도 없었다. 현금영수증
 * 원고(content-mtehy4hj-nxlmds)의 문장 70개 중 "근로소득자는 … 소득공제를 받을 수
 * 있다." 하나가 반말 종결로 그대로 통과했다.
 *
 * 존댓말 종결은 「니다·세요·십시오」로만 판정한다. 이보다 넓게 잡으면(예: 해요체
 * 전반) 처음 측정에서 오탐이 났던 전례가 있다 — "…집니다." 까지 잡아 9개로 잘못
 * 세었던 것이 실제로는 0개였다. 이 지표는 표시 전용이다(D-050 과 같은 이유):
 * 인용문·법령 원문처럼 정당하게 반말로 끝나는 문장도 섞일 수 있으므로 방향을
 * 보는 용도이지 합격 도장이 아니다. 가중치 0으로 들어가고 발행도, 검토 AI 호출
 * 조건도 건드리지 않는다.
 */
export type SentenceFormalityMeasurement = Readonly<{
  informalExamples: readonly string[];
  informalSentences: number;
  totalSentences: number;
}>;

const FORMAL_ENDING = /(?:니다|세요|십시오)$/u;
/** 문장 끝에 남는 인용부호·괄호·공백을 지운 뒤 종결 글자만 본다. */
const TRAILING_MARKS = /[.!?…"'”’』」)\]\s]+$/gu;
const PLAIN_FORM_ENDING = /다$/u;

export function measureSentenceFormality(document: ContentDocument): SentenceFormalityMeasurement {
  const prose = document.blocks
    .filter((block): block is Extract<ContentDocument["blocks"][number], { type: "paragraph" }> => block.type === "paragraph")
    .map((block) => block.text)
    .join("\n");
  const sentences = prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const informal = sentences.filter((sentence) => {
    const core = sentence.replace(TRAILING_MARKS, "");
    return PLAIN_FORM_ENDING.test(core) && !FORMAL_ENDING.test(core);
  });
  return Object.freeze({
    informalExamples: Object.freeze(informal.slice(0, 3).map((sentence) => sentence.length > 60 ? `${sentence.slice(0, 60)}…` : sentence)),
    informalSentences: informal.length,
    totalSentences: sentences.length,
  });
}

export function sentenceFormalityScore(measurement: SentenceFormalityMeasurement): number {
  if (!measurement.totalSentences) return 100;
  return Math.max(0, 100 - measurement.informalSentences * 10);
}
