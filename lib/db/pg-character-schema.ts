import {
    pgTable,
    text,
    integer,
    timestamp,
    uuid,
    jsonb,
    index,
    boolean,
    varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions, messages } from "./pg-schema";

// ============================================================================
// MAIN CHARACTERS TABLE
// ============================================================================

export const characters = pgTable("characters", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),

    // Basic Info
    name: text("name").notNull(),
    displayName: text("display_name"),
    tagline: text("tagline"),
    status: varchar("status", { length: 20 }).$type<"draft" | "active" | "archived">().default("draft").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastInteractionAt: timestamp("last_interaction_at"),

    // Metadata
    metadata: jsonb("metadata").default({}).notNull(),
});

// ============================================================================
// CHARACTER IMAGES TABLE
// ============================================================================

export const characterImages = pgTable("character_images", {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
        .references(() => characters.id, { onDelete: "cascade" })
        .notNull(),

    imageType: varchar("image_type", { length: 20 }).$type<"portrait" | "full_body" | "expression" | "outfit" | "scene" | "avatar">().notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    localPath: text("local_path").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    width: integer("width"),
    height: integer("height"),
    format: varchar("format", { length: 20 }),
    prompt: text("prompt"),
    seed: integer("seed"),
    generationModel: text("generation_model"),
    sortOrder: integer("sort_order").default(0).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// AGENT DOCUMENTS TABLE
// ============================================================================

export const agentDocuments = pgTable("agent_documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
    characterId: uuid("character_id")
        .references(() => characters.id, { onDelete: "cascade" })
        .notNull(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    extension: text("extension"),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes"),
    title: text("title"),
    description: text("description"),
    pageCount: integer("page_count"),
    sourceType: text("source_type"),
    status: varchar("status", { length: 20 }).$type<"pending" | "ready" | "failed">().default("pending").notNull(),
    errorMessage: text("error_message"),
    tags: jsonb("tags").default([]).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    embeddingModel: text("embedding_model"),
    lastIndexedAt: timestamp("last_indexed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// AGENT DOCUMENT CHUNKS TABLE
// ============================================================================

export const agentDocumentChunks = pgTable("agent_document_chunks", {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
        .references(() => agentDocuments.id, { onDelete: "cascade" })
        .notNull(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
    characterId: uuid("character_id")
        .references(() => characters.id, { onDelete: "cascade" })
        .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    tokenCount: integer("token_count"),
    embedding: jsonb("embedding"),
    embeddingModel: text("embedding_model"),
    embeddingDimensions: integer("embedding_dimensions"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// AGENT SYNC FOLDERS TABLE
// ============================================================================

export const agentSyncFolders = pgTable(
    "agent_sync_folders",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        characterId: uuid("character_id")
            .references(() => characters.id, { onDelete: "cascade" })
            .notNull(),
        folderPath: text("folder_path").notNull(),
        displayName: text("display_name"),
        isPrimary: boolean("is_primary").default(false).notNull(),
        recursive: boolean("recursive").default(true).notNull(),
        includeExtensions: jsonb("include_extensions").default(["md", "txt", "pdf", "html"]).notNull(),
        excludePatterns: jsonb("exclude_patterns").default(["node_modules", ".*", ".git"]).notNull(),
        status: varchar("status", { length: 20 }).$type<"pending" | "syncing" | "synced" | "error" | "paused">().default("pending").notNull(),
        lastSyncedAt: timestamp("last_synced_at"),
        lastError: text("last_error"),
        fileCount: integer("file_count").default(0),
        chunkCount: integer("chunk_count").default(0),
        embeddingModel: text("embedding_model"),
        indexingMode: varchar("indexing_mode", { length: 20 }).$type<"files-only" | "full" | "auto">().default("auto").notNull(),
        syncMode: varchar("sync_mode", { length: 20 }).$type<"auto" | "manual" | "scheduled" | "triggered">().default("auto").notNull(),
        syncCadenceMinutes: integer("sync_cadence_minutes").default(60).notNull(),
        fileTypeFilters: jsonb("file_type_filters").default([]).notNull(),
        maxFileSizeBytes: integer("max_file_size_bytes").default(10485760).notNull(),
        chunkPreset: varchar("chunk_preset", { length: 20 }).$type<"balanced" | "small" | "large" | "custom">().default("balanced").notNull(),
        chunkSizeOverride: integer("chunk_size_override"),
        chunkOverlapOverride: integer("chunk_overlap_override"),
        reindexPolicy: varchar("reindex_policy", { length: 20 }).$type<"smart" | "always" | "never">().default("smart").notNull(),
        skippedCount: integer("skipped_count").default(0).notNull(),
        skipReasons: jsonb("skip_reasons").default({}).notNull(),
        lastRunMetadata: jsonb("last_run_metadata").default({}).notNull(),
        lastRunTrigger: varchar("last_run_trigger", { length: 20 }).$type<"manual" | "scheduled" | "triggered" | "auto">(),
        inheritedFromWorkflowId: uuid("inherited_from_workflow_id"),
        inheritedFromAgentId: uuid("inherited_from_agent_id"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userIdx: index("agent_sync_folders_user_idx").on(table.userId),
        characterIdx: index("agent_sync_folders_character_idx").on(table.characterId),
        primaryIdx: index("agent_sync_folders_primary_idx").on(table.characterId, table.isPrimary),
        inheritedWorkflowIdx: index("agent_sync_folders_inherited_workflow_idx").on(table.inheritedFromWorkflowId),
    })
);

// ============================================================================
// AGENT SYNC FILES TABLE
// ============================================================================

export const agentSyncFiles = pgTable("agent_sync_files", {
    id: uuid("id").primaryKey().defaultRandom(),
    folderId: uuid("folder_id")
        .references(() => agentSyncFolders.id, { onDelete: "cascade" })
        .notNull(),
    characterId: uuid("character_id")
        .references(() => characters.id, { onDelete: "cascade" })
        .notNull(),
    filePath: text("file_path").notNull(),
    relativePath: text("relative_path").notNull(),
    contentHash: text("content_hash"),
    sizeBytes: integer("size_bytes"),
    modifiedAt: timestamp("modified_at"),
    status: varchar("status", { length: 20 }).$type<"pending" | "indexed" | "error">().default("pending").notNull(),
    vectorPointIds: jsonb("vector_point_ids").default([]),
    chunkCount: integer("chunk_count").default(0),
    lastIndexedAt: timestamp("last_indexed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// CHANNEL CONNECTIONS TABLE
// ============================================================================

export const channelConnections = pgTable(
    "channel_connections",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .references(() => users.id, { onDelete: "cascade" })
            .notNull(),
        characterId: uuid("character_id")
            .references(() => characters.id, { onDelete: "cascade" })
            .notNull(),
        channelType: varchar("channel_type", { length: 20 }).$type<"whatsapp" | "telegram" | "slack" | "discord">().notNull(),
        displayName: text("display_name"),
        config: jsonb("config").default({}).notNull(),
        status: varchar("status", { length: 20 }).$type<"disconnected" | "connecting" | "connected" | "error">().default("disconnected").notNull(),
        lastError: text("last_error"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userIdx: index("channel_connections_user_idx").on(table.userId),
        characterIdx: index("channel_connections_character_idx").on(table.characterId),
        typeIdx: index("channel_connections_type_idx").on(table.channelType),
    })
);

// ============================================================================
// CHANNEL CONVERSATIONS TABLE
// ============================================================================

export const channelConversations = pgTable(
    "channel_conversations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        connectionId: uuid("connection_id")
            .references(() => channelConnections.id, { onDelete: "cascade" })
            .notNull(),
        characterId: uuid("character_id")
            .references(() => characters.id, { onDelete: "cascade" })
            .notNull(),
        channelType: varchar("channel_type", { length: 20 }).$type<"whatsapp" | "telegram" | "slack" | "discord">().notNull(),
        peerId: text("peer_id").notNull(),
        peerName: text("peer_name"),
        threadId: text("thread_id"),
        sessionId: uuid("session_id")
            .references(() => sessions.id, { onDelete: "cascade" })
            .notNull(),
        lastMessageAt: timestamp("last_message_at"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        connectionIdx: index("channel_conversations_connection_idx").on(table.connectionId),
        characterIdx: index("channel_conversations_character_idx").on(table.characterId),
        peerIdx: index("channel_conversations_peer_idx").on(table.channelType, table.peerId, table.threadId),
        sessionIdx: index("channel_conversations_session_idx").on(table.sessionId),
    })
);

// ============================================================================
// CHANNEL MESSAGE MAP TABLE
// ============================================================================

export const channelMessages = pgTable(
    "channel_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        connectionId: uuid("connection_id")
            .references(() => channelConnections.id, { onDelete: "cascade" })
            .notNull(),
        channelType: varchar("channel_type", { length: 20 }).$type<"whatsapp" | "telegram" | "slack" | "discord">().notNull(),
        externalMessageId: text("external_message_id").notNull(),
        sessionId: uuid("session_id")
            .references(() => sessions.id, { onDelete: "cascade" })
            .notNull(),
        messageId: uuid("message_id")
            .references(() => messages.id, { onDelete: "cascade" })
            .notNull(),
        direction: varchar("direction", { length: 20 }).$type<"inbound" | "outbound">().notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        connectionIdx: index("channel_messages_connection_idx").on(table.connectionId),
        externalIdx: index("channel_messages_external_idx").on(table.channelType, table.externalMessageId, table.direction),
        sessionIdx: index("channel_messages_session_idx").on(table.sessionId),
    })
);

// ============================================================================
// RELATIONS
// ============================================================================

export const charactersRelations = relations(characters, ({ one, many }) => ({
    user: one(users, {
        fields: [characters.userId],
        references: [users.id],
    }),
    images: many(characterImages),
    documents: many(agentDocuments),
    documentChunks: many(agentDocumentChunks),
}));

export const characterImagesRelations = relations(characterImages, ({ one }) => ({
    character: one(characters, {
        fields: [characterImages.characterId],
        references: [characters.id],
    }),
}));

export const agentDocumentsRelations = relations(agentDocuments, ({ one, many }) => ({
    user: one(users, {
        fields: [agentDocuments.userId],
        references: [users.id],
    }),
    character: one(characters, {
        fields: [agentDocuments.characterId],
        references: [characters.id],
    }),
    chunks: many(agentDocumentChunks),
}));

export const agentDocumentChunksRelations = relations(agentDocumentChunks, ({ one }) => ({
    document: one(agentDocuments, {
        fields: [agentDocumentChunks.documentId],
        references: [agentDocuments.id],
    }),
    user: one(users, {
        fields: [agentDocumentChunks.userId],
        references: [users.id],
    }),
    character: one(characters, {
        fields: [agentDocumentChunks.characterId],
        references: [characters.id],
    }),
}));

export const agentSyncFoldersRelations = relations(agentSyncFolders, ({ one, many }) => ({
    user: one(users, {
        fields: [agentSyncFolders.userId],
        references: [users.id],
    }),
    character: one(characters, {
        fields: [agentSyncFolders.characterId],
        references: [characters.id],
    }),
    files: many(agentSyncFiles),
}));

export const agentSyncFilesRelations = relations(agentSyncFiles, ({ one }) => ({
    folder: one(agentSyncFolders, {
        fields: [agentSyncFiles.folderId],
        references: [agentSyncFolders.id],
    }),
    character: one(characters, {
        fields: [agentSyncFiles.characterId],
        references: [characters.id],
    }),
}));

// Types
export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type CharacterImage = typeof characterImages.$inferSelect;
export type NewCharacterImage = typeof characterImages.$inferInsert;
export type AgentDocument = typeof agentDocuments.$inferSelect;
export type NewAgentDocument = typeof agentDocuments.$inferInsert;
export type AgentSyncFolder = typeof agentSyncFolders.$inferSelect;
export type NewAgentSyncFolder = typeof agentSyncFolders.$inferInsert;
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type NewChannelConnection = typeof channelConnections.$inferInsert;
export type ChannelConversation = typeof channelConversations.$inferSelect;
export type NewChannelConversation = typeof channelConversations.$inferInsert;
export type ChannelMessage = typeof channelMessages.$inferSelect;
export type NewChannelMessage = typeof channelMessages.$inferInsert;
