import crypto from "node:crypto";

/**
 * Encryption Service for BYOK (Bring Your Own Key)
 * Uses AES-256-GCM for secure encryption of sensitive user data.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const ITERATIONS = 100000;

// In a real SaaS, this would be a environment variable.
// For development/initial setup, we can use a fallback (WARNING: not secure for production).
const MASTER_KEY = process.env.SELINE_MASTER_KEY || "fallback-master-key-change-this-in-env";

/**
 * Derives a strong key from the master key and a salt.
 */
function deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(MASTER_KEY, salt, ITERATIONS, KEY_LENGTH, "sha512");
}

/**
 * Encrypts a string value.
 * Output format: salt:iv:authTag:encryptedData (all hex)
 */
export function encrypt(text: string): string {
    if (!text) return "";

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = deriveKey(salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `${salt.toString("hex")}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a hex string value.
 * Expected format: salt:iv:authTag:encryptedData
 */
export function decrypt(cipherText: string): string {
    if (!cipherText) return "";

    const parts = cipherText.split(":");
    if (parts.length !== 4) {
        throw new Error("Invalid cipher text format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const encryptedText = Buffer.from(parts[3], "hex");

    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString("utf8");
}

/**
 * Encrypts a JSON object.
 */
export function encryptJSON(obj: Record<string, any>): string {
    return encrypt(JSON.stringify(obj));
}

/**
 * Decrypts a JSON object.
 */
export function decryptJSON<T = Record<string, any>>(cipherText: string): T {
    const decrypted = decrypt(cipherText);
    try {
        return JSON.parse(decrypted) as T;
    } catch (err) {
        console.error("[Encryption] Failed to parse decrypted JSON:", err);
        throw new Error("Failed to parse decrypted configuration");
    }
}
