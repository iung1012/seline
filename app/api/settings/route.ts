import { NextRequest, NextResponse } from "next/server";
import {
  loadSettings,
  saveSettings,
  validateSettingsModels,
  type AppSettings
} from "@/lib/settings/settings-manager";
import { invalidateProviderCache } from "@/lib/ai/providers";
import { validateModelConfiguration } from "@/lib/config/embedding-models";
import { requireAuth } from "@/lib/auth/local-auth";

/**
 * GET /api/settings
 * Returns current application settings for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const settings = await loadSettings(userId);

    // Don't expose full API keys - mask them for display
    const maskedSettings = {
      ...settings,
      anthropicApiKey: settings.anthropicApiKey ? maskApiKey(settings.anthropicApiKey) : undefined,
      openrouterApiKey: settings.openrouterApiKey ? maskApiKey(settings.openrouterApiKey) : undefined,
      kimiApiKey: settings.kimiApiKey ? maskApiKey(settings.kimiApiKey) : undefined,
      tavilyApiKey: settings.tavilyApiKey ? maskApiKey(settings.tavilyApiKey) : undefined,
      firecrawlApiKey: settings.firecrawlApiKey ? maskApiKey(settings.firecrawlApiKey) : undefined,
      stylyAiApiKey: settings.stylyAiApiKey ? maskApiKey(settings.stylyAiApiKey) : undefined,
      huggingFaceToken: settings.huggingFaceToken ? maskApiKey(settings.huggingFaceToken) : undefined,
      elevenLabsApiKey: settings.elevenLabsApiKey ? maskApiKey(settings.elevenLabsApiKey) : undefined,
      openaiApiKey: settings.openaiApiKey ? maskApiKey(settings.openaiApiKey) : undefined,
    };

    return NextResponse.json(maskedSettings);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Settings API] Error loading settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

/**
 * PUT /api/settings
 * Updates application settings for the authenticated user
 */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const currentSettings = await loadSettings(userId);

    // Detect provider change early
    const newProvider = body.llmProvider ?? currentSettings.llmProvider;
    const providerIsChanging = newProvider !== currentSettings.llmProvider;

    // Build updated settings
    const updatedSettings: AppSettings = {
      ...currentSettings,
      llmProvider: newProvider,
      ollamaBaseUrl: body.ollamaBaseUrl !== undefined ? body.ollamaBaseUrl : currentSettings.ollamaBaseUrl,
      theme: body.theme ?? currentSettings.theme,
      webScraperProvider: body.webScraperProvider ?? currentSettings.webScraperProvider,
      webSearchProvider: body.webSearchProvider ?? currentSettings.webSearchProvider,

      chatModel: body.chatModel !== undefined ? body.chatModel : (providerIsChanging ? "" : currentSettings.chatModel),
      embeddingProvider: body.embeddingProvider !== undefined ? body.embeddingProvider : currentSettings.embeddingProvider,
      embeddingModel: body.embeddingModel !== undefined ? body.embeddingModel : currentSettings.embeddingModel,
      researchModel: body.researchModel !== undefined ? body.researchModel : (providerIsChanging ? "" : currentSettings.researchModel),
      visionModel: body.visionModel !== undefined ? body.visionModel : (providerIsChanging ? "" : currentSettings.visionModel),
      utilityModel: body.utilityModel !== undefined ? body.utilityModel : (providerIsChanging ? "" : currentSettings.utilityModel),
      openrouterArgs: body.openrouterArgs !== undefined ? body.openrouterArgs : currentSettings.openrouterArgs,

      vectorDBEnabled: body.vectorDBEnabled !== undefined ? body.vectorDBEnabled : currentSettings.vectorDBEnabled,
      vectorAutoSyncEnabled: body.vectorAutoSyncEnabled !== undefined ? body.vectorAutoSyncEnabled : currentSettings.vectorAutoSyncEnabled,
      vectorSyncIntervalMinutes: body.vectorSyncIntervalMinutes !== undefined ? body.vectorSyncIntervalMinutes : currentSettings.vectorSyncIntervalMinutes,
      vectorSearchHybridEnabled: body.vectorSearchHybridEnabled !== undefined ? body.vectorSearchHybridEnabled : currentSettings.vectorSearchHybridEnabled,
      vectorSearchTokenChunkingEnabled: body.vectorSearchTokenChunkingEnabled !== undefined ? body.vectorSearchTokenChunkingEnabled : currentSettings.vectorSearchTokenChunkingEnabled,
      vectorSearchRerankingEnabled: body.vectorSearchRerankingEnabled !== undefined ? body.vectorSearchRerankingEnabled : currentSettings.vectorSearchRerankingEnabled,

      // Preferences
      toolLoadingMode: body.toolLoadingMode !== undefined ? body.toolLoadingMode : currentSettings.toolLoadingMode,
      promptCachingEnabled: body.promptCachingEnabled !== undefined ? body.promptCachingEnabled : currentSettings.promptCachingEnabled,

      // Voice & Audio
      ttsEnabled: body.ttsEnabled !== undefined ? body.ttsEnabled : currentSettings.ttsEnabled,
      ttsProvider: body.ttsProvider !== undefined ? body.ttsProvider : currentSettings.ttsProvider,
      sttEnabled: body.sttEnabled !== undefined ? body.sttEnabled : currentSettings.sttEnabled,
    };

    // Only update API keys if they're provided and not masked
    const keyFields = [
      "anthropicApiKey", "openrouterApiKey", "kimiApiKey",
      "tavilyApiKey", "firecrawlApiKey", "stylyAiApiKey",
      "huggingFaceToken", "elevenLabsApiKey", "openaiApiKey"
    ];

    for (const field of keyFields) {
      if (body[field] && !String(body[field]).includes("•")) {
        (updatedSettings as any)[field] = String(body[field]).trim();
      }
    }

    // Validate settings
    const modelValidation = validateSettingsModels(updatedSettings);
    if (!modelValidation.valid) {
      return NextResponse.json(
        { error: "Incompatible model configuration", details: modelValidation.errors },
        { status: 400 },
      );
    }

    // Save settings to database for this user
    await saveSettings(updatedSettings, userId);

    if (providerIsChanging) {
      invalidateProviderCache(userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Settings API] Error saving settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}

export { PUT as PATCH };

function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}
