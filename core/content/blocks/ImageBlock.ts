import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type ImageBlockPurpose =
  | "hero"
  | "comparison"
  | "checklist"
  | "infographic"
  | "summary"
  | "warning"
  | "inline";

export type ImageBlockSourceType = "planned" | "upload" | "ai_generated" | "external";

/**
 * 무료 본문 시각물의 모양. `purpose` 는 그 시각물이 무엇을 위한 것인지(체크리스트·
 * 주의·요약 …)를 말하고, `visual` 은 어떻게 그릴지를 말한다. 둘을 나눈 이유는
 * 같은 목적이라도 자료 성격에 따라 모양이 달라야 하기 때문이다 — 비교는 좌우
 * 카드일 수도, 막대그래프일 수도 있다.
 *
 * 값이 없으면 `list` 로 본다. 2026-08-29 이전에 저장된 카드는 전부 목록형이라
 * 이 기본값으로 그대로 그려진다.
 */
export type BrightVisualShape =
  | "list"
  | "bar"
  | "ratio"
  | "steps"
  | "timeline"
  | "compare"
  | "stat";

/**
 * 시각물 한 칸. `value` 는 막대·비율처럼 길이를 그려야 하는 모양에서만 쓴다.
 * 숫자가 없는 모양(목록·단계·타임라인)은 `label` 과 `note` 만 쓴다.
 */
export type BrightVisualDatum = Readonly<{
  label: string;
  note?: string;
  value?: number;
}>;

export type ImageBlock = Readonly<{
  alt: string;
  assetId?: string;
  caption?: string;
  /** 무료 시각물의 자료. 그림 파일이 있는 이미지 블록에서는 쓰지 않는다. */
  data?: readonly BrightVisualDatum[];
  fileName?: string;
  id: string;
  ownership?: ContentBlockOwnership;
  mimeType?: string;
  prompt?: string;
  purpose?: ImageBlockPurpose;
  source: string;
  sourceType?: ImageBlockSourceType;
  type: "image";
  /** 무료 시각물의 모양. 없으면 목록형으로 그린다. */
  visual?: BrightVisualShape;
}>;
