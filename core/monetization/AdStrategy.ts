export type AdProvider = "google_adsense";

export type AdPlacement = "after_block";

export type AdSlotRecommendation = Readonly<{
  id: string;
  provider: AdProvider;
  placement: AdPlacement;
  anchorBlockId: string;
  sectionHeadingId?: string;
  reason: string;
}>;

export type AdStrategyPlan = Readonly<{
  provider: AdProvider;
  eligible: boolean;
  recommendations: readonly AdSlotRecommendation[];
  reasons: readonly string[];
}>;
