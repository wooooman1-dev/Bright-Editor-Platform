# Bright Studio — Editorial Diversity Handoff

Date: 2026-08-11

## 1. Repository State

- Repository: `wooooman1-dev/Bright-Editor-Platform`
- Working branch: `feat/scheduled-publishing-and-diversity`
- Base branches merged into it: `feat/wordpress-scheduled-publishing` (PR #44) and `feat/editorial-diversity-context` (PR #46)
- Merge commit: `ab5c777`, no conflicts, no file touched by both branches
- Verification on the merged tree: `npx tsc --noEmit` clean, `npx eslint .` clean, `npx vitest run` 1895 passed / 18 skipped / 0 failed

PR #44 and PR #46 keep their original scope and are still open. The working branch exists so both features can be exercised together in the running app; it has no pull request and must not be merged into `main` without explicit approval.

The working branch deliberately has **no upstream tracking configured**. It was created from `origin/feat/wordpress-scheduled-publishing`, so a bare `git push` would have pushed the merge into PR #44. Always push it by name.

## 2. What Does Not Travel With The Repository

Three things are outside git and must be handled on the destination machine.

| Item | State | Action |
|---|---|---|
| `.bright-studio/` runtime data (projects, contents, quality reports) | git-ignored | `npm run workspace:export` on the source machine, copy, `npm run workspace:import` |
| `.env` / `.env.local` (`OPENAI_API_KEY`, `OPENAI_GENERATION_MODEL`, `OPENAI_REVIEW_MODEL`) | git-ignored | copy manually |
| Stored connection credentials (`.bin`) | **cannot be copied** | reconnect on the destination machine |

Credentials are sealed with Windows DPAPI under `DataProtectionScope::CurrentUser`. Copying them produces files that exist but cannot be decrypted, which fails later and looks like a bug rather than a missing step. `scripts/workspace-handoff.mjs` resolves every stored secret reference back to its owning connection and writes `RECONNECT.md` listing exactly what to reconnect.

The export and import scripts live on `feat/workspace-handoff-script` and are not yet merged.

Startup on the destination machine: check out the working branch, `npm install`, run the workspace import, reconnect the accounts named in `RECONNECT.md`, restore `.env.local`, then `npm run dev`.

## 3. The Problem This Work Addresses

Articles generated for the 밝은재테크 approval Project repeated one structure: the same title shape, the same heading shape, and a table, a step list, a fabricated example and a checklist in the same order in every article. `Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md` section 8 forbids template-cloned manuscripts, so this was an approval risk, not only a style problem.

The cause was not a habit of the model. The pipeline was instructing it.

## 4. Changes On `feat/editorial-diversity-context`

### 4.1 `472530b` — anti-repetition context (previous session)

Summarises the most recent articles of the same Project — title, H2 headings, opening sentence, planned shape — and attaches that summary to the editorial context that planning and generation already receive. No additional AI call. `core/content/EditorialRepetitionContext.ts`.

### 4.2 `191fbe2` — content depth was pinned Project-wide

`approvalPolicyPromptContext()` contains the literal words `comparison` and `체크리스트`. That string is stringified into `projectStrategy`, which the planning route passed whole to `classifyDepth`, whose first test is `/비교|차이|vs\b|장단점|선택지|comparison/i`. Every candidate of every approval Project therefore classified as `comparison`, and `buildTarget` then forced 비교 기준, 차이와 장단점, a table and a checklist onto every article regardless of topic.

Depth is now classified only on fields that describe the one article: `searchIntent`, `contentType`, `topicComplexity`, `readerProblem`, `selectedTopic`, `expectedCoverage`. `projectStrategy`, `domain` and `audience` remain on the input type for callers but are excluded from classification, with a comment recording why. `checklistNeeds` reads the same narrowed string.

`ContentDepthPolicyInput` also gained a `contentDepth` field so a plan can declare its own depth; keyword classification is now the fallback for plans that do not. `applyContentDepthPolicy` had been forwarding every field of the normalized target except its depth, letting re-classification overwrite what the plan decided.

This also restored `472530b`: its `repeatedShapeRule` fires when recent articles share a `contentDepth`, and with the depth pinned Project-wide that condition was always true, so the rule was a constant rather than a signal.

### 4.3 `0f5b8bb` — article shape vocabulary

`core/content/EditorialFormatOptions.ts` names five shapes the life-economy approval policy can support: `procedure`, `eligibility`, `criteria`, `correction`, `calculation`, each with a skeleton and a fit condition, plus four opening styles that state something rather than defer the answer.

They are examples for Planning, not an enum to rotate. Rotating a fixed list only lengthens the period of the repetition, and a shape applied because its turn came up rather than because the topic supports it invites invented material.

A Q&A skeleton is deliberately absent: it splits conditions, exceptions and procedure across separate answers and fails the completeness requirement. An article-length invented persona scenario is absent because it collides with the rule against generating unverified experience; a worked example remains available as a block inside `calculation` and `eligibility`.

The set is keyed by approval profile and only `wordpress_life_economy_v1` has one. Art appreciation gets nothing rather than shapes its subject cannot support.

The options travel inside `editorialDiversityPolicy`, which the existing `editorialContextWithoutDiversityPolicy` strip removes before depth classification. This matters: the shape descriptions contain 비교 and 차이 and would otherwise re-pin the classifier. The strip also keeps repair-time instructions free of any diversity demand, which is the contract documented at `ApprovalRuntimePolicy.ts:60`.

### 4.4 `116a700` — a guessed section role no longer dictates the body

A section role arrives two ways. Generation declares one per H2 and the response schema requires it (`OpenAIProvider.ts:580`); that declaration is a contract the body must honour. When a document carries no `longFormStructure` the role is guessed from heading vocabulary instead, and the guess was enforced just as strictly, so a heading containing 비교 or 차이 became a `comparison` and then needed a table to count as complete. Korean life-economy headings can hardly avoid 비교, 차이, 방법 or 기준.

Guessed roles now keep their information-element minimum but not the structural requirement. Declared roles are unchanged.

`comparisonSignals` also counted 기준, 선택 and 적합, none of which are evidence of a comparison; ordinary prose clears three without comparing anything. Those three are removed.

### 4.5 `a436ded` — the diversity contract needed rank

The policy travelled nested inside the editorial context JSON under `Project strategy:`, while the prompt body separately instructed that `primaryKeyword` carry a task modifier such as 방법. An explicit prose instruction beats a nested JSON field, and all four candidates of one planning run came back as `<주제> 방법: <설명절>` while the policy named that exact shape as the one to avoid.

`editorialDiversityPolicyFromContext()` reads the policy back out and `editorialDiversityInstruction()` states it in the prompt body: the rule, the recent titles and headings and openings, the available shapes, the opening styles. It is marked as outranking the wording conventions below it and as never outranking factual accuracy or the approval policy. Candidates must also differ from one another, not only from what is already published.

## 5. Verified Behaviour Change

Measured on the 밝은재테크 Project, which already had six published articles.

| Signal | Before | After |
|---|---|---|
| `contentDepth` across one planning run | 4 of 4 `comparison` | 3 `standard`, 1 `comparison` |
| `requiredContentElements` | identical five items on every candidate | derived per topic |
| Colon-shaped H2 headings | 2 of 6 | 1 of 7 |
| First H2 restating the title with a colon | every article | gone |
| Declared section roles in one article | uniform | checklist, steps, comparison, explanation, comparison, steps, warning |

The single `comparison` candidate was 대출 갈아타기 비교 방법, where comparison genuinely is the subject. The classification is now correct rather than merely varied.

## 6. Do Not Loosen `selectedTopic`

This was attempted twice in one session and failed both times. Two independent gates hold the topic against the keyword.

- `core/content/ContentOpportunity.ts:335` `topicAndKeywordCoherent()` rejects a candidate whose topic and keyword share no substantive term, treating 관리, 방법, 가이드, 정보, 글, 콘텐츠, 추천 and 실천 as generic. Planning returns a completed response that then fails to parse with `선정 주제와 대표 키워드가 같은 검색 의도에 속하지 않습니다`.
- `core/content/ContentOpportunityAlignment.ts:62` requires `topicKeywordCoverage >= 0.6`. Below that, `topicIdentityPass` goes false and `topicFidelity`, `contentOpportunityConsistency` and `crossTopicDrift` all fail together on that one cause, and the article is blocked at Quality Review with a 95 overall score.

Dropping the task modifier from a three-term keyword costs a third of the coverage on its own. `정부지원금 찾는 방법` planned as `정부지원금 탐색과 대상 후보 정리` measured 50 percent and was blocked.

Title shape is varied when the article is written, not by loosening the topic. The generation call already does this: under the diversity contract the title moved its separator off the colon and still passed `titleTopicAlignment` at 100 with 60 percent core-term coverage, where the threshold is 34 percent.

## 7. Open Work

1. `titleShape()` in `core/content/EditorialRepetitionContext.ts` detects only a colon, a trailing question mark and a numbered list. The model satisfied the instruction literally and moved to a comma, producing the same `<핵심어> + 구분자 + 설명절` structure. Widen it to the structure rather than the punctuation, and consider detecting a first H2 that restates the title's head term, which all three recent articles still do.
2. `core/content/RelatedPostRecommendation.ts:32` removes a candidate from `available` with `shift()` when it places the internal link, and the related-post loop then filters by `used` as well. With two published posts the result is one internal link and one related post; the expectation is up to three related posts, so with two published both should appear. The internal link and the related-post list should be allowed to overlap.
3. `qualityTarget.tableNeeds` and `checklistNeeds` came back true on every candidate. This is no longer forced by code — for `standard` depth `buildTarget` uses what the plan supplied — so it is now a planning-prompt matter: say that a table and a checklist are used when the topic needs them.
4. `informationElementCount` scores a table as a flat `tableCount * 3` regardless of row count, and a list item counts the same as a complete sentence. Weight the table by data rows.
5. PR #46 is still titled `feat: 기획·생성에 반복 회피 컨텍스트 추가`, which no longer describes a branch that also fixes depth classification, adds format options and changes section-role authority. Retitle before review.

## 8. Reference

- `Docs/current/01_PRODUCT/14_ADSENSE_APPROVAL_CONTENT_POLICY.md` — approval content policy, required article information, prohibited practices
- `origin/docs/content-format-diversity-spec` — the original diversity spec and the `qualityTarget` criteria analysis that argued against a fixed preset enum
- `HANDOFF.md`, `AGENTS.md`, `Docs/current/04_DEVELOPMENT/01_DEVELOPMENT_START.md`
