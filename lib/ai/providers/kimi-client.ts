/**
 * Kimi (Moonshot) Client (Multi-tenant)
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { KIMI_CONFIG } from "@/lib/auth/kimi-models";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getAppUrl } from "./openrouter-client";

const _kimiClients = new Map<string, ReturnType<typeof createOpenAICompatible>>();

async function kimiCustomFetch(
  url: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.thinking = { type: "disabled" };
      body.temperature = 0.6;
      body.top_p = 0.95;
      body.n = 1;
      body.presence_penalty = 0.0;
      body.frequency_penalty = 0.0;
      init = { ...init, body: JSON.stringify(body) };
    } catch { }
  }
  return globalThis.fetch(url, init);
}

export async function getKimiClient(userId: string): Promise<ReturnType<typeof createOpenAICompatible>> {
  if (_kimiClients.has(userId)) {
    return _kimiClients.get(userId)!;
  }

  const settings = await loadSettings(userId);
  const apiKey = settings.kimiApiKey || process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";

  const client = createOpenAICompatible({
    name: "kimi",
    baseURL: KIMI_CONFIG.BASE_URL,
    apiKey,
    headers: {
      "HTTP-Referer": getAppUrl(),
      "X-Title": "Seline Agent",
    },
    fetch: kimiCustomFetch,
  });

  _kimiClients.set(userId, client);
  return client;
}

export function invalidateKimiClient(userId: string): void {
  _kimiClients.delete(userId);
}
