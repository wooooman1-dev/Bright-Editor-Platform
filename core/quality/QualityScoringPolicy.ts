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
});

export type ContentLengthProfile = Readonly<{ minimumCharacters: number; targetCharacters: number; minimumSections: number }>;

export function contentLengthProfile(contentType = "article", platform = "canonical"): ContentLengthProfile {
  const normalized = `${contentType} ${platform}`.toLowerCase();
  if (/shorts|short-form|쇼츠/.test(normalized)) return { minimumCharacters: 180, targetCharacters: 450, minimumSections: 1 };
  if (/youtube/.test(normalized) && /long|script|스크립트/.test(normalized)) return { minimumCharacters: 1800, targetCharacters: 4000, minimumSections: 4 };
  if (/checklist|체크리스트/.test(normalized)) return { minimumCharacters: 700, targetCharacters: 1600, minimumSections: 3 };
  if (/comparison|비교/.test(normalized)) return { minimumCharacters: 1400, targetCharacters: 3000, minimumSections: 4 };
  if (/short|짧은/.test(normalized)) return { minimumCharacters: 600, targetCharacters: 1400, minimumSections: 2 };
  if (/tistory|blog|article|long-form|아티클|장문/.test(normalized)) return { minimumCharacters: 4800, targetCharacters: 5200, minimumSections: 5 };
  return { minimumCharacters: 900, targetCharacters: 2200, minimumSections: 3 };
}
