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
import { users, sessions } from "./pg-schema";
import { characters } from "./pg-character-schema";

export const skills = pgTable(
    "skills",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
        characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
        name: text("name").notNull(),
        description: text("description"),
        icon: text("icon"),
        promptTemplate: text("prompt_template").notNull(),
        inputParameters: jsonb("input_parameters").default([]).notNull(),
        toolHints: jsonb("tool_hints").default([]).notNull(),
        triggerExamples: jsonb("trigger_examples").default([]).notNull(),
        category: text("category").default("general").notNull(),
        version: integer("version").default(1).notNull(),
        copiedFromSkillId: uuid("copied_from_skill_id"), // Self reference handled in relations
        copiedFromCharacterId: uuid("copied_from_character_id").references(() => characters.id, { onDelete: "set null" }),
        sourceType: varchar("source_type", { length: 20 }).$type<"conversation" | "manual" | "template">().default("conversation").notNull(),
        sourceSessionId: uuid("source_session_id").references(() => sessions.id, { onDelete: "set null" }),
        sourceFormat: varchar("source_format", { length: 20 }).$type<"prompt-only" | "agentskills-package">().default("prompt-only").notNull(),
        hasScripts: boolean("has_scripts").default(false).notNull(),
        hasReferences: boolean("has_references").default(false).notNull(),
        hasAssets: boolean("has_assets").default(false).notNull(),
        scriptLanguages: jsonb("script_languages").default([]).notNull(),
        packageVersion: text("package_version"),
        license: text("license"),
        compatibility: text("compatibility"),
        runCount: integer("run_count").default(0).notNull(),
        successCount: integer("success_count").default(0).notNull(),
        lastRunAt: timestamp("last_run_at"),
        status: varchar("status", { length: 20 }).$type<"draft" | "active" | "archived">().default("active").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userCharacterStatusIdx: index("idx_skills_user_character").on(table.userId, table.characterId, table.status),
        characterNameIdx: index("idx_skills_character_name").on(table.characterId, table.name),
        userUpdatedIdx: index("idx_skills_user_updated").on(table.userId, table.updatedAt),
        userCategoryIdx: index("idx_skills_user_category").on(table.userId, table.category),
    })
);

export const skillVersions = pgTable(
    "skill_versions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        skillId: uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
        version: integer("version").notNull(),
        promptTemplate: text("prompt_template").notNull(),
        inputParameters: jsonb("input_parameters").default([]).notNull(),
        toolHints: jsonb("tool_hints").default([]).notNull(),
        description: text("description"),
        changeReason: text("change_reason"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        bySkillVersionIdx: index("idx_skill_versions_skill_version").on(table.skillId, table.version),
        bySkillCreatedIdx: index("idx_skill_versions_skill_created").on(table.skillId, table.createdAt),
    })
);

export const skillTelemetryEvents = pgTable(
    "skill_telemetry_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
        characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
        skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
        eventType: text("event_type").notNull(),
        metadata: jsonb("metadata").default({}).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        userEventIdx: index("idx_skill_telemetry_user_event").on(table.userId, table.eventType, table.createdAt),
        skillEventIdx: index("idx_skill_telemetry_skill_event").on(table.skillId, table.eventType, table.createdAt),
    })
);

export const skillFiles = pgTable(
    "skill_files",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        skillId: uuid("skill_id").references(() => skills.id, { onDelete: "cascade" }).notNull(),
        relativePath: text("relative_path").notNull(),
        content: text("content").notNull(), // Switched from blob to text (base64 or direct) for Postgres compatibility if needed, but bytea exists. Using text for now as most skills use UTF8.
        mimeType: text("mime_type"),
        size: integer("size").notNull(),
        isExecutable: boolean("is_executable").default(false).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => ({
        skillPathIdx: index("idx_skill_files_skill_path").on(table.skillId, table.relativePath),
        skillCreatedIdx: index("idx_skill_files_skill_created").on(table.skillId, table.createdAt),
    })
);

// Relations
export const skillsRelations = relations(skills, ({ one, many }) => ({
    user: one(users, { fields: [skills.userId], references: [users.id] }),
    character: one(characters, { fields: [skills.characterId], references: [characters.id] }),
    sourceSession: one(sessions, { fields: [skills.sourceSessionId], references: [sessions.id] }),
    versions: many(skillVersions),
    files: many(skillFiles),
}));

export const skillVersionsRelations = relations(skillVersions, ({ one }) => ({
    skill: one(skills, { fields: [skillVersions.skillId], references: [skills.id] }),
}));

export const skillFilesRelations = relations(skillFiles, ({ one }) => ({
    skill: one(skills, { fields: [skillFiles.skillId], references: [skills.id] }),
}));
// Types
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillVersion = typeof skillVersions.$inferSelect;
export type NewSkillVersion = typeof skillVersions.$inferInsert;
export type SkillFile = typeof skillFiles.$inferSelect;
export type NewSkillFile = typeof skillFiles.$inferInsert;
export type SkillTelemetryEvent = typeof skillTelemetryEvents.$inferSelect;
export type NewSkillTelemetryEvent = typeof skillTelemetryEvents.$inferInsert;
