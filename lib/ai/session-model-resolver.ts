/**
 * Session Model Resolver
 *
 * Resolves which model to use for a given session by checking
 * session-level overrides in metadata before falling back to
 * global settings from settings-manager.ts.
 *
 * This enables per-session model assignment:
 *   Session A → Claude Sonnet 4.5 (Anthropic)
 *   Session B → GPT-5.1 Codex (Codex)
 *   Session C → (no override) → uses global settings
 */

import type { LanguageModel } from "ai";
import type { SessionModelConfig } from "@/components/model-bag/model-bag.types";
import { loadSettings, type AppSettings } from "@/lib/settings/settings-manager";
import {
  getLanguageModel,
  getModelByName,
  getChatModel,
  getResearchModel,
  getVisionModel,
  getUtilityModel,
  type LLMProvider,
} from "@/lib/ai/providers";

// ---------------------------------------------------------------------------
// Session metadata keys for model overrides
// ---------------------------------------------------------------------------

const SESSION_MODEL_KEYS = {
  provider: "sessionProvider",
  chat: "sessionChatModel",
  research: "sessionResearchModel",
  vision: "sessionVisionModel",
  utility: "sessionUtilityModel",
} as const;

// ---------------------------------------------------------------------------
// Extract session model config from metadata
// ---------------------------------------------------------------------------

/**
 * Get the model ID string for a session (for context window lookups).
 * Returns the session override if present, otherwise the global setting.
 */
export async function getSessionModelId(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<string> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (config?.sessionChatModel) {
    return config.sessionChatModel;
  }
  // Fall back to global settings
  const settings = await loadSettings(userId);
  return settings.chatModel || "claude-sonnet-4-5-20250929";
}

/**
 * Get the provider for a session (for context window lookups).
 * Returns the session override if present, otherwise the global setting.
 */
export async function getSessionProvider(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LLMProvider> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (config?.sessionProvider) {
    return config.sessionProvider;
  }
  const settings = await loadSettings(userId);
  return (settings.llmProvider as LLMProvider) || "anthropic";
}

/**
 * Extract SessionModelConfig from session metadata.
 * Returns null if no overrides are present.
 */
export function extractSessionModelConfig(
  metadata: Record<string, unknown> | null | undefined,
): SessionModelConfig | null {
  if (!metadata) return null;

  const config: SessionModelConfig = {};
  let hasOverride = false;

  if (typeof metadata[SESSION_MODEL_KEYS.provider] === "string" && metadata[SESSION_MODEL_KEYS.provider]) {
    config.sessionProvider = metadata[SESSION_MODEL_KEYS.provider] as LLMProvider;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.chat] === "string" && metadata[SESSION_MODEL_KEYS.chat]) {
    config.sessionChatModel = metadata[SESSION_MODEL_KEYS.chat] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.research] === "string" && metadata[SESSION_MODEL_KEYS.research]) {
    config.sessionResearchModel = metadata[SESSION_MODEL_KEYS.research] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.vision] === "string" && metadata[SESSION_MODEL_KEYS.vision]) {
    config.sessionVisionModel = metadata[SESSION_MODEL_KEYS.vision] as string;
    hasOverride = true;
  }
  if (typeof metadata[SESSION_MODEL_KEYS.utility] === "string" && metadata[SESSION_MODEL_KEYS.utility]) {
    config.sessionUtilityModel = metadata[SESSION_MODEL_KEYS.utility] as string;
    hasOverride = true;
  }

  return hasOverride ? config : null;
}

// ---------------------------------------------------------------------------
// Resolve model for a session (with fallback to global)
// ---------------------------------------------------------------------------

/**
 * Resolve the chat model for a session.
 */
export async function resolveSessionChatModel(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LanguageModel> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionChatModel) {
    // No session override — use global
    return getChatModel(userId);
  }

  const modelId = config.sessionChatModel;
  console.log(`[SESSION-RESOLVER] User ${userId} using session chat model override: ${modelId}`);

  try {
    return getModelByName(userId, modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session model "${modelId}" for user ${userId}, falling back to global:`, error);
    return getChatModel(userId);
  }
}

/**
 * Resolve the primary language model for a session's streamText call.
 * This is the main entry point used by app/api/chat/route.ts.
 */
export async function resolveSessionLanguageModel(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LanguageModel> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionChatModel) {
    return getLanguageModel(userId);
  }

  const modelId = config.sessionChatModel;
  console.log(`[SESSION-RESOLVER] User ${userId} using session language model override: ${modelId}`);

  try {
    return getModelByName(userId, modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session model "${modelId}" for user ${userId}, falling back to global:`, error);
    return getLanguageModel(userId);
  }
}

/**
 * Resolve the research model for a session.
 */
export async function resolveSessionResearchModel(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LanguageModel> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionResearchModel) {
    return getResearchModel(userId);
  }

  const modelId = config.sessionResearchModel;
  console.log(`[SESSION-RESOLVER] User ${userId} using session research model override: ${modelId}`);

  try {
    return getModelByName(userId, modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session research model "${modelId}" for user ${userId}, falling back to global:`, error);
    return getResearchModel(userId);
  }
}

/**
 * Resolve the vision model for a session.
 */
export async function resolveSessionVisionModel(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LanguageModel> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionVisionModel) {
    return getVisionModel(userId);
  }

  const modelId = config.sessionVisionModel;
  console.log(`[SESSION-RESOLVER] User ${userId} using session vision model override: ${modelId}`);

  try {
    return getModelByName(userId, modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session vision model "${modelId}" for user ${userId}, falling back to global:`, error);
    return getVisionModel(userId);
  }
}

/**
 * Resolve the utility model for a session.
 */
export async function resolveSessionUtilityModel(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<LanguageModel> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (!config?.sessionUtilityModel) {
    return getUtilityModel(userId);
  }

  const modelId = config.sessionUtilityModel;
  console.log(`[SESSION-RESOLVER] User ${userId} using session utility model override: ${modelId}`);

  try {
    return getModelByName(userId, modelId);
  } catch (error) {
    console.warn(`[SESSION-RESOLVER] Failed to load session utility model "${modelId}" for user ${userId}, falling back to global:`, error);
    return getUtilityModel(userId);
  }
}

/**
 * Build the session model config object to store in session.metadata.
 * Only includes non-empty values.
 */
export function buildSessionModelMetadata(
  config: SessionModelConfig,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (config.sessionProvider) result[SESSION_MODEL_KEYS.provider] = config.sessionProvider;
  if (config.sessionChatModel) result[SESSION_MODEL_KEYS.chat] = config.sessionChatModel;
  if (config.sessionResearchModel) result[SESSION_MODEL_KEYS.research] = config.sessionResearchModel;
  if (config.sessionVisionModel) result[SESSION_MODEL_KEYS.vision] = config.sessionVisionModel;
  if (config.sessionUtilityModel) result[SESSION_MODEL_KEYS.utility] = config.sessionUtilityModel;
  return result;
}

/**
 * Clear all session model overrides from metadata.
 * Returns a new metadata object with session model keys removed.
 */
export function clearSessionModelMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...metadata };
  for (const key of Object.values(SESSION_MODEL_KEYS)) {
    delete result[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Session-aware provider/display helpers
// ---------------------------------------------------------------------------

/** Provider display name map (matches model-bag.constants.ts) */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  antigravity: "Antigravity",
  codex: "OpenAI Codex",
  claudecode: "Claude Code",
  kimi: "Moonshot Kimi",
  ollama: "Ollama",
};

/**
 * Get the display name for the LLM being used in a session.
 */
export async function getSessionDisplayName(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
): Promise<string> {
  const config = extractSessionModelConfig(sessionMetadata);
  if (config?.sessionChatModel) {
    const providerName = config.sessionProvider
      ? (PROVIDER_NAMES[config.sessionProvider] || config.sessionProvider)
      : "Unknown";
    return `${providerName} (${config.sessionChatModel})`;
  }

  const settings = await loadSettings(userId);
  const provider = settings.llmProvider || "anthropic";
  const providerName = PROVIDER_NAMES[provider] || provider;
  const model = settings.chatModel || "claude-sonnet-4-5";

  return `${providerName} (${model})`;
}

/**
 * Get the appropriate temperature for a session's provider.
 */
export async function getSessionProviderTemperature(
  userId: string,
  sessionMetadata: Record<string, unknown> | null | undefined,
  requestedTemp: number,
): Promise<number> {
  const config = extractSessionModelConfig(sessionMetadata);
  let provider: string;

  if (config?.sessionProvider) {
    provider = config.sessionProvider;
  } else {
    const settings = await loadSettings(userId);
    provider = settings.llmProvider || "anthropic";
  }

  if (provider === "kimi") {
    return 1; // Kimi K2.5 fixed value
  }
  return requestedTemp;
}
