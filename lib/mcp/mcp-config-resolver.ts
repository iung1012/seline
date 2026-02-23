/**
 * MCP config resolution: environment variable expansion, synced-folder injection,
 * and filesystem-server auto-path attachment.
 *
 * Extracted from client-manager.ts to keep the manager focused on connection lifecycle.
 */

import path from "path";
import type { MCPServerConfig, ResolvedMCPServer } from "./types";

// ── Path validation ───────────────────────────────────────────────────────────

export function validateFolderPath(folderPath: string): boolean {
    const resolved = path.resolve(folderPath);
    const allowedBases = [
        process.env.USER_DATA_DIR,
        "/app/data",
        process.env.HOME // For local development compatibility
    ].filter(Boolean) as string[];

    return allowedBases.some(base => resolved.startsWith(path.resolve(base)));
}

export function isFilesystemPathArg(arg: string): boolean {
    if (!arg || arg.startsWith("-")) return false;
    if (arg === "@modelcontextprotocol/server-filesystem" || arg === "server-filesystem") return false;
    if (arg.startsWith("http://") || arg.startsWith("https://")) return false;
    return true; // includes synced-folder variables and real paths
}

export function hasFilesystemPathArg(args?: string[]): boolean {
    if (!args || args.length === 0) return false;
    return args.some(isFilesystemPathArg);
}

// ── Config resolver ───────────────────────────────────────────────────────────

/**
 * Resolve environment variables and determine transport type in MCP config.
 * Supports ${SYNCED_FOLDER} (primary) and ${SYNCED_FOLDERS} (all, comma-separated).
 */
export async function resolveMCPConfig(
    serverName: string,
    config: MCPServerConfig,
    env: Record<string, string>,
    characterId?: string
): Promise<ResolvedMCPServer> {
    console.log(`[MCP] Resolving config for ${serverName}:`, {
        hasCharacterId: !!characterId,
        configArgs: config.args,
    });

    const resolveValue = async (value: string): Promise<string> => {
        let resolved = value;

        // Handle standard environment variables
        return resolved.replace(/\$\{([^}]+)\}/g, (_, varName) => env[varName] || "");
    };

    // Determine transport type
    const transportType: "http" | "sse" | "stdio" = config.command
        ? "stdio"
        : (config.type || "sse");

    if (transportType === "stdio") {
        const resolvedEnv: Record<string, string> = {};
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                resolvedEnv[key] = await resolveValue(value);
            }
        }

        // Resolve arguments with special handling for ${SYNCED_FOLDERS_ARRAY}
        let resolvedArgs: string[] = [];
        if (config.args) {
            for (const arg of config.args) {
                resolvedArgs.push(await resolveValue(arg));
            }
        }

        console.log(`[MCP] ✅ Resolved ${serverName}:`, {
            command: config.command,
            args: resolvedArgs,
            env: Object.keys(resolvedEnv),
        });

        return {
            name: serverName,
            type: "stdio",
            command: config.command ? await resolveValue(config.command) : undefined,
            args: resolvedArgs,
            env: resolvedEnv,
            timeout: config.timeout || 30000,
        };
    }

    // HTTP/SSE transport
    const resolvedHeaders: Record<string, string> = {};
    if (config.headers) {
        for (const [key, value] of Object.entries(config.headers)) {
            resolvedHeaders[key] = await resolveValue(value);
        }
    }

    return {
        name: serverName,
        type: transportType,
        url: config.url ? await resolveValue(config.url) : undefined,
        headers: resolvedHeaders,
        timeout: config.timeout || 30000,
    };
}
