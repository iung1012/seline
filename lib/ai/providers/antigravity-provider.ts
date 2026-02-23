/**
 * Antigravity AI Provider (Multi-tenant SaaS)
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import {
  getAntigravityToken,
  ANTIGRAVITY_CONFIG,
  fetchAntigravityProjectId,
} from "@/lib/auth/antigravity-auth";
import { createAntigravityFetch } from "./antigravity-streaming";

export {
  normalizeAntigravityToolSchemas,
  sanitizeSchema,
  isPlainObject,
  DEFAULT_ANTIGRAVITY_INPUT_SCHEMA,
  ANTIGRAVITY_ALLOWED_SCHEMA_KEYS,
} from "./antigravity-schema";

export {
  createAntigravityFetch,
  createResponseTransformStreamWithRetry,
  unwrapResponse,
  ensureClaudeFunctionPartIds,
  isGenerativeLanguageRequest,
  generateRequestId,
  generateSessionId,
} from "./antigravity-streaming";

const MODEL_ALIASES: Record<string, string> = {
  "gemini-3-pro-high": "gemini-3-pro-high",
  "gemini-3-pro-low": "gemini-3-pro-low",
  "gemini-3-flash": "gemini-3-flash",
  "claude-sonnet-4-5": "claude-sonnet-4-5",
  "claude-sonnet-4-5-thinking": "claude-sonnet-4-5-thinking",
  "claude-opus-4-6-thinking": "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium": "gpt-oss-120b-medium",
};

function resolveModelName(modelId: string): string {
  const modelWithoutPrefix = modelId.replace(/^antigravity-/i, "");
  const model = MODEL_ALIASES[modelWithoutPrefix] || modelWithoutPrefix;

  if (model.toLowerCase() === "gemini-3-pro") {
    return "gemini-3-pro-low";
  }
  return model;
}

/**
 * Get an Antigravity provider instance for a specific user.
 */
export async function getAntigravityProvider(userId: string): Promise<((modelId: string) => LanguageModel)> {
  const token = await getAntigravityToken(userId);
  if (!token) {
    throw new Error(`[Antigravity] No token available for user ${userId}`);
  }

  const accessToken = token.access_token;
  let projectId = token.project_id || "";

  if (!projectId) {
    console.log(`[Antigravity] Fetching project ID for user ${userId}...`);
    const fetchedProjectId = await fetchAntigravityProjectId(userId);
    if (fetchedProjectId) {
      projectId = fetchedProjectId;
    }
  }

  const google = createGoogleGenerativeAI({
    baseURL: `${ANTIGRAVITY_CONFIG.API_BASE_URL}/v1beta`,
    apiKey: "",
    fetch: createAntigravityFetch(accessToken, projectId, resolveModelName),
  });

  return (modelId: string): LanguageModel => {
    const effectiveModel = resolveModelName(modelId);
    return google(effectiveModel) as unknown as LanguageModel;
  };
}

// Legacy export for compatibility if needed, but should prefer getAntigravityProvider(userId)
export function createAntigravityProvider() {
  throw new Error("createAntigravityProvider is deprecated. Use getAntigravityProvider(userId) instead.");
}
