import { calculateContentMetrics, type ContentDocument } from "../content";
import type { AdSlotRecommendation, AdStrategyPlan } from "./AdStrategy";

const minimumEligibleCharacters = 1800;
const minimumCharactersBetweenSlots = 900;
const minimumAnchorParagraphCharacters = 120;

export class AdStrategyEngine {
  plan(document: ContentDocument): AdStrategyPlan {
    const metrics = calculateContentMetrics(document);
    if (metrics.charactersWithoutSpaces < minimumEligibleCharacters) {
      return Object.freeze({
        provider: "google_adsense",
        eligible: false,
        recommendations: Object.freeze([]),
        reasons: Object.freeze([`본문이 ${minimumEligibleCharacters}자 미만이라 인아티클 광고 슬롯을 추천하지 않습니다.`]),
      });
    }

    const candidates = collectCandidates(document);
    const maximumSlots = resolveMaximumSlots(metrics.charactersWithoutSpaces);
    const recommendations = selectRecommendations(candidates, maximumSlots);

    return Object.freeze({
      provider: "google_adsense",
      eligible: recommendations.length > 0,
      recommendations: Object.freeze(recommendations),
      reasons: Object.freeze(recommendations.length > 0
        ? [`본문 흐름을 끊지 않는 의미 단락 종료 지점 ${recommendations.length}곳을 추천했습니다.`]
        : ["광고와 이미지·링크가 연속되지 않는 안전한 의미 단락 종료 지점을 찾지 못했습니다."]),
    });
  }
}

type Candidate = Readonly<{
  anchorBlockId: string;
  sectionHeadingId?: string;
  charactersBefore: number;
}>;

function collectCandidates(document: ContentDocument): readonly Candidate[] {
  const blocks = document.blocks;
  const result: Candidate[] = [];
  let charactersBefore = 0;
  let currentHeadingId: string | undefined;
  let seenFirstHeading = false;

  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      currentHeadingId = block.id;
      if (block.level === 2) seenFirstHeading = true;
      return;
    }

    if (block.type !== "paragraph") return;
    charactersBefore += block.text.replace(/\s/g, "").length;

    const previous = blocks[index - 1];
    const next = blocks[index + 1];
    const isDevelopedParagraph = block.text.trim().length >= minimumAnchorParagraphCharacters;
    const startsSectionBody = previous?.type === "heading";
    const adjacentNonProse = previous?.type === "image" || previous?.type === "button" || previous?.type === "video"
      || next?.type === "image" || next?.type === "button" || next?.type === "video";

    if (!seenFirstHeading || !isDevelopedParagraph || startsSectionBody || adjacentNonProse) return;

    result.push(Object.freeze({
      anchorBlockId: block.id,
      ...(currentHeadingId ? { sectionHeadingId: currentHeadingId } : {}),
      charactersBefore,
    }));
  });

  return Object.freeze(result);
}

function selectRecommendations(candidates: readonly Candidate[], maximumSlots: number): readonly AdSlotRecommendation[] {
  const selected: AdSlotRecommendation[] = [];
  let previousCharactersBefore = 0;

  for (const candidate of candidates) {
    if (selected.length >= maximumSlots) break;
    if (candidate.charactersBefore < minimumEligibleCharacters / 2) continue;
    if (selected.length > 0 && candidate.charactersBefore - previousCharactersBefore < minimumCharactersBetweenSlots) continue;

    selected.push(Object.freeze({
      id: `adsense-slot-${selected.length + 1}`,
      provider: "google_adsense",
      placement: "after_block",
      anchorBlockId: candidate.anchorBlockId,
      ...(candidate.sectionHeadingId ? { sectionHeadingId: candidate.sectionHeadingId } : {}),
      reason: "핵심 설명이 끝나고 다음 정보로 전환되며 이미지·링크와 연속되지 않는 위치입니다.",
    }));
    previousCharactersBefore = candidate.charactersBefore;
  }

  return Object.freeze(selected);
}

function resolveMaximumSlots(characters: number): number {
  if (characters >= 4800) return 3;
  if (characters >= 3000) return 2;
  return 1;
}
