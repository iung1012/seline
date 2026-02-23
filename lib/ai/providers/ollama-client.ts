/**
 * Ollama Client
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { loadSettings } from "@/lib/settings/settings-manager";

const _clients = new Map<string, ReturnType<typeof createOpenAICompatible>>();

export async function getOllamaBaseUrl(userId: string): Promise<string> {
  const settings = await loadSettings(userId);
  return settings.ollamaBaseUrl || "http://localhost:11434/v1";
}

export async function getOllamaClient(userId: string): Promise<ReturnType<typeof createOpenAICompatible>> {
  const baseUrl = await getOllamaBaseUrl(userId);

  if (_clients.has(userId)) {
    return _clients.get(userId)!;
  }

  const client = createOpenAICompatible({
    name: "ollama",
    baseURL: baseUrl,
  });

  _clients.set(userId, client);
  return client;
}

export function invalidateOllamaClient(userId: string): void {
  _clients.delete(userId);
}
