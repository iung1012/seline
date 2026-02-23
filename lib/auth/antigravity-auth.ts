/**
 * Antigravity Authentication Module (Multi-tenant)
 *
 * Manages OAuth token storage, refresh, and authentication for Antigravity's
 * free AI models (Gemini 3 Pro, Claude Sonnet 4.5, etc.).
 */

import { loadSettings, saveSettings } from "@/lib/settings/settings-manager";
import { ANTIGRAVITY_MODEL_IDS, type AntigravityModelId } from "@/lib/auth/antigravity-models";

// Antigravity OAuth token structure
export interface AntigravityOAuthToken {
  type: "oauth";
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp in milliseconds
  token_type?: string;
  scope?: string;
  project_id?: string; // Antigravity project ID
}

// Auth state stored in settings
export interface AntigravityAuthState {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: number;
  lastRefresh?: number;
  projectId?: string;
}

// Google OAuth configuration for Antigravity
export const ANTIGRAVITY_OAUTH = {
  CLIENT_ID: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  CLIENT_SECRET: "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",
  AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth",
  TOKEN_URL: "https://oauth2.googleapis.com/token",
  USERINFO_URL: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
  SCOPES: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
  ],
} as const;

const ANTIGRAVITY_VERSION = "1.15.8";

export const ANTIGRAVITY_CONFIG = {
  API_BASE_URL: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  API_VERSION: "v1internal",
  ANTIGRAVITY_VERSION,
  REFRESH_THRESHOLD_MS: 15 * 60 * 1000,
  HEADERS: {
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
  } as const,
  AVAILABLE_MODELS: ANTIGRAVITY_MODEL_IDS,
} as const;

/**
 * Get the current Antigravity authentication state for a user
 */
export async function getAntigravityAuthState(userId: string): Promise<AntigravityAuthState> {
  const settings = await loadSettings(userId);
  return {
    isAuthenticated: !!settings.antigravityAuth?.isAuthenticated,
    email: settings.antigravityAuth?.email,
    expiresAt: settings.antigravityAuth?.expiresAt,
    lastRefresh: settings.antigravityAuth?.lastRefresh,
  };
}

/**
 * Get the stored OAuth token for Antigravity for a user
 */
export async function getAntigravityToken(userId: string): Promise<AntigravityOAuthToken | null> {
  const settings = await loadSettings(userId);
  return settings.antigravityToken || null;
}

/**
 * Check if the current token is valid and not expired
 */
export async function isAntigravityTokenValid(userId: string): Promise<boolean> {
  const token = await getAntigravityToken(userId);
  if (!token) return false;

  const now = Date.now();
  return token.expires_at > (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS);
}

/**
 * Check if the token needs refresh
 */
export async function needsTokenRefresh(userId: string): Promise<boolean> {
  const token = await getAntigravityToken(userId);
  if (!token) return false;

  const now = Date.now();
  const expiresAt = token.expires_at;

  return expiresAt <= (now + ANTIGRAVITY_CONFIG.REFRESH_THRESHOLD_MS) && expiresAt > now;
}

/**
 * Save Antigravity OAuth token and update auth state for a user
 */
export async function saveAntigravityToken(
  userId: string,
  token: AntigravityOAuthToken,
  email?: string,
  setAsActiveProvider = false
): Promise<void> {
  const settings = await loadSettings(userId);

  settings.antigravityToken = token;
  settings.antigravityAuth = {
    isAuthenticated: true,
    email: email || settings.antigravityAuth?.email,
    expiresAt: token.expires_at,
    lastRefresh: Date.now(),
  };

  if (setAsActiveProvider) {
    settings.llmProvider = "antigravity";
  }

  await saveSettings(settings, userId);
  console.log(`[AntigravityAuth] Token saved for user ${userId}`);
}

/**
 * Clear Antigravity authentication for a user
 */
export async function clearAntigravityAuth(userId: string): Promise<void> {
  const settings = await loadSettings(userId);

  delete settings.antigravityToken;
  settings.antigravityAuth = { isAuthenticated: false };

  await saveSettings(settings, userId);
}

/**
 * Get the access token for API requests for a user
 */
export async function getAntigravityAccessToken(userId: string): Promise<string | null> {
  const token = await getAntigravityToken(userId);
  if (!token || token.expires_at <= Date.now()) return null;
  return token.access_token;
}

/**
 * Ensure the token is valid, refreshing if necessary.
 */
export async function ensureValidToken(userId: string): Promise<boolean> {
  if (await isAntigravityTokenValid(userId)) return true;

  const token = await getAntigravityToken(userId);
  if (token?.refresh_token) {
    return await refreshAntigravityToken(userId);
  }

  return false;
}

/**
 * Refresh the Antigravity OAuth token
 */
export async function refreshAntigravityToken(userId: string): Promise<boolean> {
  const token = await getAntigravityToken(userId);
  if (!token || !token.refresh_token) return false;

  try {
    let refreshToken = token.refresh_token;
    let projectId = token.project_id || "";

    if (refreshToken.includes("|")) {
      const parts = refreshToken.split("|");
      refreshToken = parts[0] || refreshToken;
      projectId = parts[1] || projectId;
    }

    const response = await fetch(ANTIGRAVITY_OAUTH.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ANTIGRAVITY_OAUTH.CLIENT_ID,
        client_secret: ANTIGRAVITY_OAUTH.CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    if (data.access_token) {
      const newToken: AntigravityOAuthToken = {
        type: "oauth",
        access_token: data.access_token,
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        token_type: data.token_type || "Bearer",
        scope: data.scope,
        project_id: projectId,
      };

      const authState = await getAntigravityAuthState(userId);
      await saveAntigravityToken(userId, newToken, authState.email);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[AntigravityAuth] Refresh error:", error);
    return false;
  }
}

/**
 * Fetch the Antigravity project ID
 */
export async function fetchAntigravityProjectId(userId: string): Promise<string | null> {
  const token = await getAntigravityToken(userId);
  if (!token) return null;
  if (token.project_id) return token.project_id;

  const loadCodeAssistUrl = `${ANTIGRAVITY_CONFIG.API_BASE_URL}/${ANTIGRAVITY_CONFIG.API_VERSION}:loadCodeAssist`;
  try {
    const response = await fetch(loadCodeAssistUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        ...ANTIGRAVITY_CONFIG.HEADERS,
      },
      body: JSON.stringify({
        metadata: { ideType: "IDE_UNSPECIFIED", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const projectId = data.cloudaicompanionProject || data.id;
      if (projectId) {
        const updatedToken = { ...token, project_id: projectId };
        const authState = await getAntigravityAuthState(userId);
        await saveAntigravityToken(userId, updatedToken, authState.email);
        return projectId;
      }
    }
  } catch (error) {
    console.error("[AntigravityAuth] Project ID fetch error:", error);
  }
  return null;
}

export { getAntigravityModelDisplayName, getAntigravityModels } from "@/lib/auth/antigravity-models";
export const ANTIGRAVITY_SYSTEM_INSTRUCTION = ""; // Placeholder if needed
