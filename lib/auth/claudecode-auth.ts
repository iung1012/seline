import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";

export interface ClaudeCodeOAuthToken {
  type: "oauth";
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface ClaudeCodeAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
}

export const CLAUDECODE_OAUTH = {
  CLIENT_ID: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  AUTH_URL: "https://claude.ai/oauth/authorize",
  TOKEN_URL: "https://console.anthropic.com/v1/oauth/token",
  REDIRECT_URI: "https://console.anthropic.com/oauth/code/callback",
  SCOPES: "org:create_api_key user:profile user:inference",
} as const;

export const CLAUDECODE_CONFIG = {
  API_BASE_URL: "https://api.anthropic.com",
  ANTHROPIC_VERSION: "2023-06-01",
  REFRESH_THRESHOLD_MS: 15 * 60 * 1000,
  BETA_HEADERS: [
    "claude-code-20250219",
    "oauth-2025-04-20",
    "interleaved-thinking-2025-05-14",
    "fine-grained-tool-streaming-2025-05-14",
  ],
  REQUIRED_SYSTEM_PREFIX: "You are Claude Code, Anthropic's official CLI for Claude.",
} as const;

export async function getClaudeCodeAuthState(userId: string): Promise<ClaudeCodeAuthState> {
  const settings = await loadSettings(userId);
  return {
    isAuthenticated: !!settings.claudecodeAuth?.isAuthenticated,
    email: settings.claudecodeAuth?.email,
    expiresAt: settings.claudecodeAuth?.expiresAt,
    lastRefresh: settings.claudecodeAuth?.lastRefresh,
  };
}

export async function getClaudeCodeToken(userId: string): Promise<ClaudeCodeOAuthToken | null> {
  const settings = await loadSettings(userId);
  return settings.claudecodeToken || null;
}

export async function isClaudeCodeTokenValid(userId: string): Promise<boolean> {
  const token = await getClaudeCodeToken(userId);
  if (!token) return false;

  const now = Date.now();
  return token.expires_at > (now + CLAUDECODE_CONFIG.REFRESH_THRESHOLD_MS);
}

export async function needsClaudeCodeTokenRefresh(userId: string): Promise<boolean> {
  const token = await getClaudeCodeToken(userId);
  if (!token) return false;

  const now = Date.now();
  const expiresAt = token.expires_at;
  return expiresAt <= (now + CLAUDECODE_CONFIG.REFRESH_THRESHOLD_MS);
}

export async function saveClaudeCodeToken(
  userId: string,
  token: ClaudeCodeOAuthToken,
  email?: string,
  setAsActiveProvider = false
): Promise<void> {
  const settings = await loadSettings(userId);

  settings.claudecodeToken = token;
  settings.claudecodeAuth = {
    isAuthenticated: true,
    email: email || settings.claudecodeAuth?.email,
    expiresAt: token.expires_at,
    lastRefresh: Date.now(),
  };

  if (setAsActiveProvider) {
    settings.llmProvider = "claudecode";
  }

  await saveSettings(settings, userId);
}

export async function clearClaudeCodeAuth(userId: string): Promise<void> {
  const settings = await loadSettings(userId);
  delete settings.claudecodeToken;
  settings.claudecodeAuth = { isAuthenticated: false };
  await saveSettings(settings, userId);
}

export async function getClaudeCodeAccessToken(userId: string): Promise<string | null> {
  const token = await getClaudeCodeToken(userId);
  if (!token || token.expires_at <= Date.now()) return null;
  return token.access_token;
}

export async function isClaudeCodeAuthenticated(userId: string): Promise<boolean> {
  const state = await getClaudeCodeAuthState(userId);
  if (!state.isAuthenticated) return false;
  return await isClaudeCodeTokenValid(userId);
}

export async function refreshClaudeCodeToken(userId: string): Promise<boolean> {
  const token = await getClaudeCodeToken(userId);
  if (!token?.refresh_token) return false;

  try {
    const response = await fetch(CLAUDECODE_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: CLAUDECODE_OAUTH.CLIENT_ID,
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (data.access_token) {
      const newToken: ClaudeCodeOAuthToken = {
        type: "oauth",
        access_token: data.access_token,
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      };

      await saveClaudeCodeToken(userId, newToken);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[ClaudeCodeAuth] Refresh error:", error);
    return false;
  }
}

export async function ensureValidClaudeCodeToken(userId: string): Promise<boolean> {
  if (await isClaudeCodeTokenValid(userId)) return true;
  if (await needsClaudeCodeTokenRefresh(userId)) {
    return await refreshClaudeCodeToken(userId);
  }
  return false;
}

export async function exchangeClaudeCodeAuthorizationCode(
  code: string,
  verifier: string,
  userId: string,
  redirectUri: string = CLAUDECODE_OAUTH.REDIRECT_URI,
  state?: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  const response = await fetch(CLAUDECODE_OAUTH.TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLAUDECODE_OAUTH.CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      state,
    }),
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.access_token) return null;

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || "",
    expires_in: data.expires_in,
  };
}
