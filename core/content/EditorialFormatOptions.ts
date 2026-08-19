/**
 * Shapes an approval-stage article can take, offered to Planning as examples.
 *
 * This is deliberately not an enum to rotate through. Cycling a fixed list only
 * lengthens the period of the repetition it is meant to remove, and a shape
 * applied because its turn came up rather than because the topic supports it
 * invites invented content, which the approval policy forbids outright. Planning
 * picks by topic fit, or names a shape that is not on the list; the
 * anti-repetition context is what keeps consecutive articles apart.
 */
export type EditorialFormatOption = Readonly<{
  id: string;
  name: string;
  skeleton: string;
  fitsWhen: string;
}>;

export type EditorialFormatOptionSet = Readonly<{
  options: readonly EditorialFormatOption[];
  introStyles: readonly string[];
  rule: string;
}>;

/**
 * Derived from the required article information of the life-economy approval
 * policy rather than from general blogging formats, so every shape here is one
 * an official source can actually support.
 *
 * Two common formats are absent by intent. A Q&A skeleton splits the conditions,
 * exceptions and procedure across separate answers and fails the completeness
 * requirement. A article-length invented persona scenario collides with the rule
 * against generating experiences that were not verified; a worked example stays
 * available as a block inside `calculation` and `eligibility`.
 */
export const lifeEconomyEditorialFormatOptions: EditorialFormatOptionSet = Object.freeze({
  options: Object.freeze([
    Object.freeze({
      id: "procedure",
      name: "절차 안내형",
      skeleton: "준비 서류 → 단계별 절차 → 처리 기간 → 접수 후 확인 방법",
      fitsWhen: "독자가 신청이나 신고를 어떻게 하는지 알아야 할 때",
    }),
    Object.freeze({
      id: "eligibility",
      name: "대상 판단형",
      skeleton: "적용 조건 분해 → 본인 해당 여부 확인 방법 → 제외되는 경우 → 확인 경로",
      fitsWhen: "독자가 자신이 대상인지부터 판단해야 할 때",
    }),
    Object.freeze({
      id: "criteria",
      name: "기준 비교형",
      skeleton: "비교 축 정의 → 제도 간 차이 → 상황별 적용 기준",
      fitsWhen: "둘 이상의 제도나 선택지를 같은 기준으로 견주어야 할 때. 금융상품 가입을 유도하는 비교에는 쓰지 않는다",
    }),
    Object.freeze({
      id: "correction",
      name: "오해 정정형",
      skeleton: "흔한 오해와 실수 → 공식 근거로 정정 → 올바른 기준 정리",
      fitsWhen: "잘못 알려진 내용이 실제로 있고 공식 자료로 바로잡을 수 있을 때",
    }),
    Object.freeze({
      id: "calculation",
      name: "계산 기준형",
      skeleton: "계산 구조 분해 → 변수별 기준 → 적용 예시 → 적용 시점과 예외 명시",
      fitsWhen: "금액, 세액 또는 지원액이 어떻게 정해지는지가 독자의 질문일 때",
    }),
  ]),
  /**
   * Openings that state something. The approval policy requires the article not
   * to defer its answer, which rules out the rhetorical question and the mood
   * setting paragraph that generic blog formats open with.
   */
  introStyles: Object.freeze([
    "핵심 답변을 먼저 제시하고 조건을 뒤에 설명",
    "독자 상황을 조건별로 갈라 제시한 뒤 해당 갈래로 진입",
    "흔한 오해를 먼저 지적하고 정정할 내용을 예고",
    "이 글이 다루는 적용 범위와 한계를 먼저 한정",
  ]),
  rule: [
    "아래는 이 사이트에서 성립하는 글의 형태와 도입부 화법의 예시 목록이다.",
    "순번대로 돌려쓰지 말고 이번 주제가 실제로 뒷받침하는 형태를 고른다.",
    "적합한 형태가 목록에 없으면 목록 밖의 형태를 써도 된다.",
    "형태를 맞추려고 없는 사례, 없는 오해, 확인되지 않은 수치를 만들지 않는다.",
    "고른 형태와 무관하게 그 주제에 필요한 정보 요소와 완결성 기준은 그대로 충족한다.",
  ].join(" "),
});

/**
 * Art appreciation has its own shapes and none of the life-economy ones fit, so
 * that profile intentionally has no set yet rather than borrowing shapes that
 * would push the writing toward procedures the subject does not have.
 */
export function editorialFormatOptionsFor(
  profileId: string | undefined,
): EditorialFormatOptionSet | undefined {
  return profileId === "wordpress_life_economy_v1" ? lifeEconomyEditorialFormatOptions : undefined;
}
