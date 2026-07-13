export type AIRequest = Readonly<{
  instruction: string;
  metadata?: Readonly<Record<string, string>>;
}>;

export type AIResponse = Readonly<{
  content: string;
  model: string;
}>;

export interface AIProvider {
  generate(request: AIRequest): Promise<AIResponse>;
}
