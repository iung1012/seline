import {
    pgTable,
    text,
    integer,
    timestamp,
    uuid,
    jsonb,
    index,
    boolean,
    doublePrecision,
    varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================================
// USERS TABLE
// ============================================================================

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id"),
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SESSIONS TABLE
// ============================================================================

export const sessions = pgTable(
    "sessions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id").references(() => users.id),
        title: text("title"),
        status: varchar("status", { length: 20 }).$type<"active" | "archived" | "deleted">().default("active").notNull(),
        providerSessionId: text("provider_session_id"),
        summary: text("summary"),
        summaryUpToMessageId: uuid("summary_up_to_message_id"),
        characterId: uuid("character_id"),
        messageCount: integer("message_count").default(0).notNull(),
        totalTokenCount: integer("total_token_count").default(0).notNull(),
        lastMessageAt: timestamp("last_message_at"),
        lastOrderingIndex: integer("last_ordering_index").default(0).notNull(),
        channelType: varchar("channel_type", { length: 20 }).$type<"whatsapp" | "telegram" | "slack">(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
        metadata: jsonb("metadata").default({}).notNull(),
    },
    (table) => ({
        idxSessionsUserCharacter: index("idx_sessions_user_character").on(table.userId, table.characterId, table.status),
        idxSessionsUserUpdated: index("idx_sessions_user_updated").on(table.userId, table.updatedAt),
        idxSessionsCharacterUpdated: index("idx_sessions_character_updated").on(table.characterId, table.updatedAt),
    })
);

// ============================================================================
// MESSAGES TABLE
// ============================================================================

export const messages = pgTable(
    "messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        sessionId: uuid("session_id")
            .references(() => sessions.id, { onDelete: "cascade" })
            .notNull(),
        parentId: uuid("parent_id"),
        role: varchar("role", { length: 20 }).$type<"system" | "user" | "assistant" | "tool">().notNull(),
        content: jsonb("content").notNull(),
        model: text("model"),
        toolName: text("tool_name"),
        toolCallId: text("tool_call_id"),
        isCompacted: boolean("is_compacted").default(false).notNull(),
        tokenCount: integer("token_count"),
        orderingIndex: integer("ordering_index"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        metadata: jsonb("metadata").default({}).notNull(),
    },
    (table) => ({
        idxMessagesSessionOrdering: index("idx_messages_session_ordering").on(table.sessionId, table.orderingIndex),
    })
);

// ============================================================================
// TOOL RUNS TABLE
// ============================================================================

export const toolRuns = pgTable("tool_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
        .references(() => sessions.id, { onDelete: "cascade" })
        .notNull(),
    messageId: uuid("message_id").references(() => messages.id),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").notNull(),
    result: jsonb("result"),
    status: varchar("status", { length: 20 }).$type<"pending" | "running" | "succeeded" | "failed" | "cancelled">().default("pending").notNull(),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    metadata: jsonb("metadata").default({}).notNull(),
});

// ============================================================================
// WEB BROWSE ENTRIES TABLE
// ============================================================================

export const webBrowseEntries = pgTable("web_browse_entries", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
        .references(() => sessions.id, { onDelete: "cascade" })
        .notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    contentLength: integer("content_length").notNull(),
    images: jsonb("images").default([]).notNull(),
    ogImage: text("og_image"),
    fetchedAt: timestamp("fetched_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
});

// ============================================================================
// IMAGES TABLE
// ============================================================================

export const images = pgTable("images", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
        .references(() => sessions.id, { onDelete: "cascade" })
        .notNull(),
    messageId: uuid("message_id").references(() => messages.id),
    toolRunId: uuid("tool_run_id").references(() => toolRuns.id),
    role: varchar("role", { length: 20 }).$type<"upload" | "reference" | "generated" | "mask" | "tile">().notNull(),
    localPath: text("local_path").notNull(),
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
    format: varchar("format", { length: 20 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
});

// ============================================================================
// USER SETTINGS TABLE (BYOK)
// ============================================================================

export const userSettings = pgTable("user_settings", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
    encryptedConfig: text("encrypted_config"),
    preferences: jsonb("preferences").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many, one }) => ({
    sessions: many(sessions),
    settings: one(userSettings, {
        fields: [users.id],
        references: [userSettings.userId],
    }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
    user: one(users, {
        fields: [sessions.userId],
        references: [users.id],
    }),
    messages: many(messages),
    toolRuns: many(toolRuns),
    webBrowseEntries: many(webBrowseEntries),
    images: many(images),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
    session: one(sessions, {
        fields: [messages.sessionId],
        references: [sessions.id],
    }),
    parent: one(messages, {
        fields: [messages.parentId],
        references: [messages.id],
        relationName: "message_parent",
    }),
    children: many(messages, { relationName: "message_parent" }),
    toolRuns: many(toolRuns),
    images: many(images),
}));

export const toolRunsRelations = relations(toolRuns, ({ one, many }) => ({
    session: one(sessions, {
        fields: [toolRuns.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [toolRuns.messageId],
        references: [messages.id],
    }),
    images: many(images),
}));

export const webBrowseEntriesRelations = relations(webBrowseEntries, ({ one }) => ({
    session: one(sessions, {
        fields: [webBrowseEntries.sessionId],
        references: [sessions.id],
    }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
    session: one(sessions, {
        fields: [images.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [images.messageId],
        references: [messages.id],
    }),
    toolRun: one(toolRuns, {
        fields: [images.toolRunId],
        references: [toolRuns.id],
    }),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
    user: one(users, {
        fields: [userSettings.userId],
        references: [users.id],
    }),
}));

// Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ToolRun = typeof toolRuns.$inferSelect;
export type NewToolRun = typeof toolRuns.$inferInsert;
export type WebBrowseEntry = typeof webBrowseEntries.$inferSelect;
export type NewWebBrowseEntry = typeof webBrowseEntries.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
