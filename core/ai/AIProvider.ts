export type AIRequest = Readonly<{
  instruction: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type AIWebSource = Readonly<{
  url: string;
  title?: string;
  excerpt?: string;
  provenance?: "search_candidate" | "citation";
}>;

export type AIResponse = Readonly<{
  content: string;
  model: string;
  diagnostics?: Readonly<{
    responseId?: string;
    status?: string;
    incompleteReason?: string;
    outputTokens?: number;
    requestTimeoutMs?: number;
    elapsedMs?: number;
    webSources?: readonly AIWebSource[];
  }>;
}>;

export interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
}
