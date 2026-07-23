import { calculateContentMetrics, canonicalDocumentText, type ContentDocument } from "../content";
import { QualityEngine as BaseQualityEngine, type QualityDimensionResult, type QualityReport, type QualityReviewContext } from "./QualityEngine";
import { contentLengthProfile, qualityDimensionWeights } from "./QualityScoringPolicy";

export class QualityEngine extends BaseQualityEngine {
  override review(document: ContentDocument, context: QualityReviewContext = {}): QualityReport {
    const report = super.review(document, context);
    const usefulness = report.dimensions.find((item) => item.category === "usefulness");
    if (!usefulness || usefulness.status !== "blocked" || usefulness.evaluation === "evaluated") return report;

    const score = usefulnessScore(document, context);
    const dimensions = report.dimensions.map((item): QualityDimensionResult => item.category === "usefulness"
      ? Object.freeze({ ...item, score, evaluation: "evaluated" })
      : item);
    const scoringWeight = Object.values(qualityDimensionWeights).reduce((sum, weight) => sum + weight, 0);
    const overallScore = Math.round(dimensions.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0) / scoringWeight);

    return Object.freeze({
      ...report,
      overallScore,
      reviews: Object.freeze(dimensions),
      dimensions: Object.freeze(dimensions),
    });
  }
}

function usefulnessScore(document: ContentDocument, context: QualityReviewContext): number {
  const text = canonicalDocumentText(document);
  const metrics = calculateContentMetrics(document);
  const paragraphs = document.blocks.filter((block) => block.type === "paragraph");
  const profile = contentLengthProfile(context.contentType, context.platform);
  const depthScore = clamp(Math.round(Math.min(1, metrics.charactersWithoutSpaces / profile.targetCharacters) * 65 + Math.min(35, paragraphs.length * 4)));
  const placeholders = /(?:lorem ipsum|내용을 입력|여기에 .+ 입력|예시 문구|placeholder|todo|tbd)/i.test(text);
  const externalClaims = /(?:\d+(?:\.\d+)?%|연구에 따르면|통계에 따르면|according to (?:research|a study))/i.test(text);
  const hasCitation = /https?:\/\/|출처|참고문헌|source:/i.test(text);
  const experienceClaim = /(?:제가|나는|저는|직접)\s*.{0,24}(?:경험했|겪었|사용했|먹어봤|해봤)/i.test(text);
  const practicalToolSignals = matches(text, /(?:체크리스트|기록표|예시|순서|단계|먼저|다음으로|마지막으로|한눈에|표로 정리|행동 흐름)/g);
  const repeatedCoreAdviceCount = countRepeatedCoreAdvice(paragraphs.map((item) => item.text));
  return clamp(depthScore
    - (placeholders ? 40 : 0)
    - (externalClaims && !hasCitation ? 10 : 0)
    - (experienceClaim ? 20 : 0)
    - (practicalToolSignals < 3 ? 15 : 0)
    - Math.min(15, repeatedCoreAdviceCount * 3));
}

function countRepeatedCoreAdvice(paragraphs: readonly string[]): number {
  const patterns = [/(?:같은|일정한) 조건/, /한 번의 (?:숫자|수치)/, /기록(?:해|을 남)/, /의료진(?:에게|과)/, /임의로 (?:바꾸|변경)/];
  return patterns.reduce((sum, pattern) => sum + Math.max(0, paragraphs.filter((paragraph) => pattern.test(paragraph)).length - 1), 0);
}

function matches(value: string, pattern: RegExp): number { return [...value.matchAll(pattern)].length; }
function clamp(value: number): number { return Math.max(0, Math.min(100, value)); }
