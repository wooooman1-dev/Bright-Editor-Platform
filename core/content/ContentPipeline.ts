import type { ContentDocument } from "./ContentDocument";
import {
  DefaultContentValidator,
  type ContentValidator,
  type ContentValidationResult,
} from "./ContentValidator";
import { ContentNormalizer } from "./processors/ContentNormalizer";
import { ContentOptimizer } from "./processors/ContentOptimizer";

export type ContentPipelineResult = Readonly<{
  document: ContentDocument;
  validation: ContentValidationResult;
}>;

export type ContentPipelineDependencies = Readonly<{
  normalizer?: Pick<ContentNormalizer, "normalize">;
  optimizer?: Pick<ContentOptimizer, "optimize">;
  validator?: Pick<ContentValidator, "validate">;
}>;

export class ContentPipeline {
  private readonly normalizer: Pick<ContentNormalizer, "normalize">;
  private readonly optimizer: Pick<ContentOptimizer, "optimize">;
  private readonly validator: Pick<ContentValidator, "validate">;

  constructor(dependencies: ContentPipelineDependencies = {}) {
    this.normalizer = dependencies.normalizer ?? new ContentNormalizer();
    this.validator = dependencies.validator ?? new DefaultContentValidator();
    this.optimizer = dependencies.optimizer ?? new ContentOptimizer();
  }

  process(document: ContentDocument): ContentPipelineResult {
    const normalized = this.normalizer.normalize(document);
    const validation = this.validator.validate(normalized);

    if (!validation.valid) {
      return Object.freeze({ document: normalized, validation });
    }

    const optimized = this.optimizer.optimize(normalized);

    return Object.freeze({ document: optimized, validation });
  }
}
