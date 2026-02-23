import type { PromptEnhancementResult } from "./prompt-enhancement";

export interface LLMEnhancementOptions {
  timeoutMs?: number;
  conversationContext?: Array<{ role: string; content: string }>;
  userId?: string;
  sessionId?: string;
  sessionMetadata?: Record<string, unknown> | null;
  includeFileTree?: boolean;
  includeMemories?: boolean;
}

export interface LLMEnhancementResult extends PromptEnhancementResult {
  usedLLM?: boolean;
  error?: string;
}

export async function enhancePromptWithLLM(
  userInput: string,
  characterId: string | null,
  options: LLMEnhancementOptions = {}
): Promise<LLMEnhancementResult> {
  return {
    enhanced: false,
    prompt: userInput.trim(),
    originalQuery: userInput.trim(),
    usedLLM: false,
    skipReason: "Local LLM Prompt Enhancement is not supported in the web SaaS version.",
  };
}
