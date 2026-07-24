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
