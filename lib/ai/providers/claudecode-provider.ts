import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import {
  CLAUDECODE_CONFIG,
  ensureValidClaudeCodeToken,
  getClaudeCodeAccessToken,
} from "@/lib/auth/claudecode-auth";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";

const CLAUDECODE_MAX_RETRY_ATTEMPTS = 5;

// (Helper functions sanitizeLoneSurrogates, sanitizeJsonStringValues, 
// isDictionary, normalizeAnthropicToolUseInputs, readErrorPreview omitted for brevity 
// but would normally be part of the full file content. 
// I'll keep them in the write_to_file call below.)

function sanitizeLoneSurrogates(input: string): { value: string; changed: boolean } {
  let changed = false;
  let output = "";
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        output += input[i] + input[i + 1];
        i += 1;
      } else {
        output += "\ufffd";
        changed = true;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\ufffd";
      changed = true;
      continue;
    }
    output += input[i];
  }
  return { value: output, changed };
}

export function sanitizeJsonStringValues(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") return sanitizeLoneSurrogates(value);
  if (Array.isArray(value)) {
    let changed = false;
    const sanitizedArray = value.map((entry) => {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: sanitizedArray, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      sanitizedObject[key] = result.value;
    }
    return { value: sanitizedObject, changed };
  }
  return { value, changed: false };
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAnthropicToolUseInputs(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  fixedCount: number;
} {
  const messages = body.messages;
  if (!Array.isArray(messages)) return { body, fixedCount: 0 };
  let fixedCount = 0;
  const normalizedMessages = messages.map((message) => {
    if (!isDictionary(message) || !Array.isArray(message.content)) return message;
    const normalizedContent = message.content.map((part) => {
      if (!isDictionary(part) || part.type !== "tool_use") return part;
      const input = part.input;
      if (isDictionary(input)) return part;
      if (typeof input === "string") {
        try {
          const parsed = JSON.parse(input);
          if (isDictionary(parsed)) {
            fixedCount += 1;
            return { ...part, input: parsed };
          }
        } catch { }
      }
      fixedCount += 1;
      return {
        ...part,
        input: {
          _recoveredInvalidToolUseInput: true,
          _inputType: input === null ? "null" : Array.isArray(input) ? "array" : typeof input,
        },
      };
    });
    return { ...message, content: normalizedContent };
  });
  return { body: { ...body, messages: normalizedMessages }, fixedCount };
}

async function readErrorPreview(response: Response): Promise<string> {
  try { return await response.clone().text(); } catch { return ""; }
}

function createClaudeCodeFetch(userId: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes("api.anthropic.com")) return fetch(input, init);

    const tokenValid = await ensureValidClaudeCodeToken(userId);
    if (!tokenValid) throw new Error("Claude Code authentication required");

    const accessToken = await getClaudeCodeAccessToken(userId);
    if (!accessToken) throw new Error("Claude Code access token missing");

    const headers = new Headers(init?.headers ?? {});
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("anthropic-version", CLAUDECODE_CONFIG.ANTHROPIC_VERSION);
    headers.set("anthropic-beta", CLAUDECODE_CONFIG.BETA_HEADERS.join(","));
    headers.set("User-Agent", "seline-agent/1.0.0");

    let updatedInit = init;
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        const existingSystem = body.system;
        if (typeof existingSystem === "string") {
          body.system = `${CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX}\n\n${existingSystem}`;
        } else if (Array.isArray(existingSystem)) {
          body.system = [{ type: "text", text: CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX }, ...existingSystem];
        } else {
          body.system = CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX;
        }

        const normalizedToolInputs = normalizeAnthropicToolUseInputs(body);
        const sanitizedBody = sanitizeJsonStringValues(normalizedToolInputs.body);
        updatedInit = { ...init, body: JSON.stringify(sanitizedBody.value) };
      } catch { }
    }

    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(input, { ...updatedInit, headers });
      } catch (error) {
        const classification = classifyRecoverability({ provider: "claudecode", error, message: String(error) });
        if (!shouldRetry({ classification, attempt, maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS, aborted: init?.signal?.aborted ?? false })) throw error;
        await sleepWithAbort(getBackoffDelayMs(attempt), init?.signal ?? undefined);
        continue;
      }
      if (!response.ok) {
        const errorText = await readErrorPreview(response);
        const classification = classifyRecoverability({ provider: "claudecode", statusCode: response.status, message: errorText });
        if (shouldRetry({ classification, attempt, maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS, aborted: init?.signal?.aborted ?? false })) {
          await sleepWithAbort(getBackoffDelayMs(attempt), init?.signal ?? undefined);
          continue;
        }
      }
      return response;
    }
  };
}

export async function getClaudeCodeProvider(userId: string): Promise<(modelId: string) => LanguageModel> {
  const provider = createAnthropic({
    apiKey: "claudecode-oauth",
    fetch: createClaudeCodeFetch(userId),
  });

  return (modelId: string): LanguageModel => {
    return provider(modelId) as unknown as LanguageModel;
  };
}

export function createClaudeCodeProvider() {
  throw new Error("createClaudeCodeProvider is deprecated. Use getClaudeCodeProvider(userId) instead.");
}
