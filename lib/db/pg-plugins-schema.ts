import {
    pgTable,
    text,
    integer,
    timestamp,
    uuid,
    jsonb,
    varchar,
    boolean,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./pg-schema";
import { characters } from "./pg-character-schema";
import { agentWorkflows } from "./pg-workflows-schema";

export const plugins = pgTable(
    "plugins",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        description: text("description").notNull(),
        version: text("version").notNull(),
        scope: varchar("scope", { length: 20 }).$type<"user" | "project" | "local" | "managed">().default("user").notNull(),
        status: varchar("status", { length: 20 }).$type<"active" | "disabled" | "error">().default("active").notNull(),
        marketplaceName: text("marketplace_name"),
        manifest: jsonb("manifest").notNull(),
        components: jsonb("components").notNull(),
        userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
        characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }),
        cachePath: text("cache_path"),
        lastError: text("last_error"),
        installedAt: timestamp("installed_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userScopeIdx: index("idx_plugins_user_scope").on(table.userId, table.scope, table.status),
        nameMarketplaceIdx: uniqueIndex("idx_plugins_name_marketplace_user").on(table.name, table.marketplaceName, table.userId),
        characterIdx: index("idx_plugins_character").on(table.characterId),
    })
);

export const pluginHooks = pgTable(
    "plugin_hooks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        event: text("event").notNull(),
        matcher: text("matcher"),
        handlerType: varchar("handler_type", { length: 20 }).$type<"command" | "prompt" | "agent">().notNull(),
        command: text("command"),
        timeout: integer("timeout").default(600),
        statusMessage: text("status_message"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        pluginEventIdx: index("idx_plugin_hooks_plugin_event").on(table.pluginId, table.event),
    })
);

export const pluginMcpServers = pgTable(
    "plugin_mcp_servers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        serverName: text("server_name").notNull(),
        config: jsonb("config").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        pluginServerIdx: uniqueIndex("idx_plugin_mcp_servers_plugin_server").on(table.pluginId, table.serverName),
    })
);

export const pluginLspServers = pgTable(
    "plugin_lsp_servers",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        serverName: text("server_name").notNull(),
        config: jsonb("config").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        pluginServerIdx: uniqueIndex("idx_plugin_lsp_servers_plugin_server").on(table.pluginId, table.serverName),
    })
);

export const pluginFiles = pgTable(
    "plugin_files",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        relativePath: text("relative_path").notNull(),
        mimeType: text("mime_type"),
        size: integer("size").notNull(),
        isExecutable: boolean("is_executable").default(false).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        pluginPathIdx: index("idx_plugin_files_plugin_path").on(table.pluginId, table.relativePath),
    })
);

export const pluginSkillRevisions = pgTable(
    "plugin_skill_revisions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        namespacedName: text("namespaced_name").notNull(),
        content: text("content").notNull(),
        version: integer("version").default(1).notNull(),
        changeReason: text("change_reason"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        pluginSkillVersionUnique: uniqueIndex("idx_plugin_skill_revisions_plugin_name_version").on(
            table.pluginId,
            table.namespacedName,
            table.version
        ),
    })
);

export const agentPlugins = pgTable(
    "agent_plugins",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        agentId: uuid("agent_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
        pluginId: uuid("plugin_id").references(() => plugins.id, { onDelete: "cascade" }).notNull(),
        workflowId: uuid("workflow_id").references(() => agentWorkflows.id, { onDelete: "set null" }),
        enabled: boolean("enabled").default(true).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        agentPluginUnique: uniqueIndex("idx_agent_plugins_agent_plugin").on(table.agentId, table.pluginId),
    })
);

export const marketplaces = pgTable(
    "marketplaces",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull().unique(),
        source: text("source").notNull(),
        catalog: jsonb("catalog"),
        autoUpdate: boolean("auto_update").default(true).notNull(),
        lastFetchedAt: timestamp("last_fetched_at"),
        lastError: text("last_error"),
        userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userIdx: index("idx_marketplaces_user").on(table.userId),
    })
);

// Relations
export const pluginsRelations = relations(plugins, ({ one, many }) => ({
    user: one(users, { fields: [plugins.userId], references: [users.id] }),
    character: one(characters, { fields: [plugins.characterId], references: [characters.id] }),
    hooks: many(pluginHooks),
    mcpServers: many(pluginMcpServers),
    lspServers: many(pluginLspServers),
    files: many(pluginFiles),
    skillRevisions: many(pluginSkillRevisions),
    agentAssignments: many(agentPlugins),
}));

export const agentPluginsRelations = relations(agentPlugins, ({ one }) => ({
    agent: one(characters, { fields: [agentPlugins.agentId], references: [characters.id] }),
    plugin: one(plugins, { fields: [agentPlugins.pluginId], references: [plugins.id] }),
    workflow: one(agentWorkflows, { fields: [agentPlugins.workflowId], references: [agentWorkflows.id] }),
}));

export const pluginHooksRelations = relations(pluginHooks, ({ one }) => ({
    plugin: one(plugins, { fields: [pluginHooks.pluginId], references: [plugins.id] }),
}));

export const marketplacesRelations = relations(marketplaces, ({ one }) => ({
    user: one(users, { fields: [marketplaces.userId], references: [users.id] }),
}));
