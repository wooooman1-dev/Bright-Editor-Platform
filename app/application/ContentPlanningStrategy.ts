import type { AIProvider, AIUsageRecord } from "../../core/ai";
import type { ContentPlanningResult, WorkspacePlatform } from "../user-flow/user-data";
import {
  ContentPlanningStrategy as BaseContentPlanningStrategy,
  type ContentPlanningContext,
} from "./ContentPlanningStrategyBase";

export * from "./ContentPlanningStrategyBase";

type UsageBox = { value?: AIUsageRecord };

export class ContentPlanningStrategy extends BaseContentPlanningStrategy {
  private readonly usageBox: UsageBox;

  constructor(provider: AIProvider) {
    const usageBox: UsageBox = {};
    super({
      generate: async (request) => {
        const response = await provider.generate(request);
        usageBox.value = response.diagnostics?.aiUsage;
        return response;
      },
    });
    this.usageBox = usageBox;
  }

  override async analyze(
    naturalLanguageRequest: string,
    enabledPlatforms?: readonly WorkspacePlatform[],
    context: ContentPlanningContext = { projectId: "planning-project", selectionMode: "userSpecified" },
  ): Promise<ContentPlanningResult> {
    this.usageBox.value = undefined;
    const plan = await super.analyze(naturalLanguageRequest, enabledPlatforms, context);
    return this.usageBox.value
      ? Object.freeze({ ...plan, aiUsage: this.usageBox.value }) as ContentPlanningResult
      : plan;
  }
}
