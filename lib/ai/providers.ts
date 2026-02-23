/**
 * LLM Provider Configuration (Multi-tenant SaaS)
 *
 * This file acts as a central router for all AI providers in Seline.
 * It manages provider-specific settings, model defaults, and instantiation
 * while ensuring per-user isolation.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { loadSettings } from "@/lib/settings/settings-manager";

// Provider-specific clients
import { getAntigravityProvider } from "@/lib/ai/providers/antigravity-provider";
import { getClaudeCodeProvider } from "@/lib/ai/providers/claudecode-provider";
import { getCodexProvider } from "@/lib/ai/providers/codex-provider";
import { getKimiClient } from "@/lib/ai/providers/kimi-client";
import { getOpenRouterClient } from "@/lib/ai/providers/openrouter-client";
import { getOllamaClient } from "@/lib/ai/providers/ollama-client";

// Auth/Token helpers
import { ensureValidToken as ensureAntigravityTokenValid } from "@/lib/auth/antigravity-auth";
import { ensureValidClaudeCodeToken as ensureClaudeCodeTokenValid } from "@/lib/auth/claudecode-auth";

export { ensureAntigravityTokenValid, ensureClaudeCodeTokenValid };

export type LLMProvider =
  | "anthropic"
  | "openrouter"
  | "antigravity"
  | "codex"
  | "kimi"
  | "ollama"
  | "claudecode";

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  openrouter: "openrouter/auto",
  antigravity: "claude-sonnet-4-5",
  codex: "gpt-5.1-codex",
  claudecode: "claude-sonnet-4-5-20250929",
  kimi: "kimi-k2.5",
  ollama: "llama3.1:8b",
};

/**
 * Get a language model instance for the configured provider and model.
 */
export async function getLanguageModel(userId: string, modelOverride?: string): Promise<LanguageModel> {
  const settings = await loadSettings(userId);
  const provider = settings.llmProvider || "anthropic";
  const model = modelOverride || settings.chatModel || DEFAULT_MODELS[provider as LLMProvider];

  console.log(`[PROVIDERS] User ${userId} using provider: ${provider}, model: ${model}`);

  switch (provider) {
    case "ollama":
      return (await getOllamaClient(userId))(model);

    case "openrouter":
      return (await getOpenRouterClient(userId))(model);

    case "antigravity":
      return (await getAntigravityProvider(userId))(model);

    case "claudecode":
      return (await getClaudeCodeProvider(userId))(model);

    case "codex":
      return (await getCodexProvider(userId))(model);

    case "kimi":
      return (await getKimiClient(userId))(model);

    case "anthropic":
    default: {
      const anthropic = createAnthropic({
        apiKey: settings.anthropicApiKey,
      });
      return anthropic(model);
    }
  }
}

/**
 * Convenience getter for the main chat model
 */
export async function getChatModel(userId: string): Promise<LanguageModel> {
  return getLanguageModel(userId);
}

/**
 * Convenience getters for specialized roles
 */
export async function getResearchModel(userId: string): Promise<LanguageModel> {
  const settings = await loadSettings(userId);
  if (settings.researchModel) return getLanguageModel(userId, settings.researchModel);
  return getLanguageModel(userId);
}

export async function getVisionModel(userId: string): Promise<LanguageModel> {
  const settings = await loadSettings(userId);
  if (settings.visionModel) return getLanguageModel(userId, settings.visionModel);
  return getLanguageModel(userId);
}

export async function getUtilityModel(userId: string): Promise<LanguageModel> {
  const settings = await loadSettings(userId);
  if (settings.utilityModel) return getLanguageModel(userId, settings.utilityModel);
  return getLanguageModel(userId);
}

/**
 * Get a model by name, routing to the correct provider
 */
export async function getModelByName(userId: string, modelId: string): Promise<LanguageModel> {
  // Routing logic: if it contains a slash, route to OpenRouter
  if (modelId.includes("/")) {
    return (await getOpenRouterClient(userId))(modelId);
  }
  // Otherwise try Antigravity or Anthropic based on user's active provider or defaults
  return getLanguageModel(userId, modelId);
}

/**
 * Invalidate all provider clients for a specific user.
 * Call this when LLM settings are updated.
 */
export function invalidateProviderCache(userId: string): void {
  // No-op for now as most clients were refactored to be more lean
  // but we could call specific invalidation logic here.
}
