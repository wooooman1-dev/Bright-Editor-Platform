export type AIRequest = Readonly<{
  instruction: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type AIResponse = Readonly<{
  content: string;
  model: string;
  diagnostics?: Readonly<{
    responseId?: string;
    status?: string;
    incompleteReason?: string;
    outputTokens?: number;
  }>;
}>;

export interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
}
