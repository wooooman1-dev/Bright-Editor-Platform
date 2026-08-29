import type { ContentDocument } from "../content/ContentDocument";

/**
 * 서버가 이미 가져와 문서에 저장한 출처 발췌를, 생성 이후 수정 호출에도 넘긴다.
 *
 * 2026-08-28 실측이 근거다. 「AI 문서 수정」 호출의 지시문에는 현재 문서만 들어가고
 * 발췌는 들어가지 않는다 (`contentDocumentAIContext` 가 approvalEvidence 를 제외).
 * 그런데 같은 호출이 승인 정책 규칙은 그대로 받는다:
 *
 *   "use only verified official Evidence supplied by the server … If verified
 *    Evidence is unavailable, preserve the limitation instead of fabricating
 *    certainty." (ApprovalPolicy.ts)
 *
 * 서버가 Evidence 를 하나도 주지 않으므로 모델은 규칙대로 금액을 쓰지 않는다.
 * 국민연금 원고에서 공단 발췌의 "최저 41만원에서 최고 659만원" 이 본문에 들어가지
 * 못한 이유이며, 사람이 그 값을 지시문에 직접 적어 넣어야만 들어갔다.
 *
 * 그래서 이것은 새 권한이 아니라 이미 있는 규칙이 작동하게 만드는 연결이다.
 * 발췌만 추리면 실측 중앙값 236자, 최대 4,308자로 호출 비용에 영향이 없다.
 *
 * Quality Review 경로에는 붙이지 않는다. 그쪽은 새 사실 추가를
 * `QualityReviewFactualGuard` 가 서버에서 거부하는 별도 설계다.
 */
export function withStoredEvidencePassagesInstruction(
  instruction: string,
  document: ContentDocument,
): string {
  const passages = (document.metadata?.approvalEvidence?.sources ?? [])
    .map((source) => ({
      excerpt: typeof source.citationExcerpt === "string" ? source.citationExcerpt.trim() : "",
      publisher: source.publisher?.trim() || source.title?.trim() || "",
      url: source.url ?? "",
    }))
    .filter((source) => Boolean(source.excerpt));
  if (!passages.length) return instruction;
  const rendered = passages.map((source, index) => [
    `${index + 1}. ${source.publisher || source.url}`,
    `URL: ${source.url}`,
    `Stored passage: ${source.excerpt}`,
  ].join("\n")).join("\n\n");
  return `${instruction}

Stored official source passages (already fetched and saved by the server for this manuscript):
${rendered}
- These are the verified official Evidence the server supplies for this edit. They are source material, not new research.
- Write a figure, date, amount, threshold, or institution name only when it appears verbatim in a passage above or already appears in the current manuscript. Never write one from your own knowledge of the subject.
- When the manuscript leaves out a value that a passage states, stating that value is an improvement: name the amount instead of describing that an amount exists.
- Do not add or change a source URL, and do not create a reader-visible source section.`;
}
