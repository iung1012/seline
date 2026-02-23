import { db } from "./client";
import { userSettings } from "./schema";
import { eq } from "drizzle-orm";
import { encryptJSON, decryptJSON } from "@/lib/auth/encryption";
import type { UserSetting, NewUserSetting } from "./schema";

export async function getUserSettings(userId: string): Promise<UserSetting | null> {
    const settings = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
    });
    return settings || null;
}

export async function upsertUserSettings(
    userId: string,
    updates: {
        encryptedConfig?: Record<string, any>;
        preferences?: Record<string, any>;
    }
): Promise<UserSetting> {
    const existing = await getUserSettings(userId);

    const encryptedConfig = updates.encryptedConfig
        ? encryptJSON(updates.encryptedConfig)
        : existing?.encryptedConfig;

    const preferences = updates.preferences
        ?? existing?.preferences
        ?? {};

    if (existing) {
        const [updated] = await db
            .update(userSettings)
            .set({
                encryptedConfig,
                preferences,
                updatedAt: new Date(),
            })
            .where(eq(userSettings.userId, userId))
            .returning();
        return updated;
    } else {
        const [inserted] = await db
            .insert(userSettings)
            .values({
                userId,
                encryptedConfig,
                preferences,
            })
            .returning();
        return inserted;
    }
}

/**
 * Helper to get decrypted config for a user
 */
export async function getDecryptedConfig(userId: string): Promise<Record<string, any>> {
    const settings = await getUserSettings(userId);
    if (!settings || !settings.encryptedConfig) return {};

    try {
        return decryptJSON(settings.encryptedConfig);
    } catch (err) {
        console.error(`[Settings] Failed to decrypt config for user ${userId}:`, err);
        return {};
    }
}

/**
 * Helper to update a single encrypted key
 */
export async function updateEncryptedKey(
    userId: string,
    key: string,
    value: string
): Promise<void> {
    const config = await getDecryptedConfig(userId);
    config[key] = value;
    await upsertUserSettings(userId, { encryptedConfig: config });
}
