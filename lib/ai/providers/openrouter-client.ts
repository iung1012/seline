/**
 * OpenRouter Client
 *
 * Lazy-initialized OpenAI-compatible client for the OpenRouter API.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { loadSettings } from "@/lib/settings/settings-manager";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export async function getOpenRouterApiKey(userId: string): Promise<string | undefined> {
  const settings = await loadSettings(userId);
  return settings.openrouterApiKey;
}

export function getAppUrl(): string {
  // In SaaS, this would typically come from an environment variable or request context
  return process.env.NEXT_PUBLIC_APP_URL || "https://seline.ai";
}

// We use a Map to cache clients per user to avoid recreating them on every call
const _clients = new Map<string, ReturnType<typeof createOpenAICompatible>>();

export async function getOpenRouterClient(userId: string): Promise<ReturnType<typeof createOpenAICompatible>> {
  const settings = await loadSettings(userId);
  const apiKey = settings.openrouterApiKey;

  const cacheKey = `${userId}:${apiKey}`;

  if (_clients.has(userId) && _clients.get(userId)) {
    // Logic to check if key changed could be added here if needed, 
    // but Map per user is safer for SaaS.
  }

  // Parse OpenRouter args from settings
  let providerOptions = {};
  if (settings.openrouterArgs) {
    try {
      providerOptions = JSON.parse(settings.openrouterArgs);
    } catch (error) {
      console.warn("[PROVIDERS] Invalid OpenRouter args JSON:", error);
    }
  }

  const client = createOpenAICompatible({
    name: "openrouter",
    baseURL: OPENROUTER_BASE_URL,
    apiKey: apiKey || "",
    headers: {
      "HTTP-Referer": getAppUrl(),
      "X-Title": "Seline Web",
    },
    ...providerOptions,
  });

  _clients.set(userId, client);
  return client;
}

export function invalidateOpenRouterClient(userId: string): void {
  _clients.delete(userId);
}
