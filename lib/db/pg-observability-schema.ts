import {
    pgTable,
    text,
    integer,
    timestamp,
    uuid,
    jsonb,
    varchar,
    boolean,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users, sessions, messages, toolRuns } from "./pg-schema";
import { skills } from "./pg-skills-schema";

export const agentRuns = pgTable("agent_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
        .references(() => sessions.id, { onDelete: "cascade" })
        .notNull(),
    userId: uuid("user_id").references(() => users.id),
    characterId: uuid("character_id"),

    pipelineName: text("pipeline_name").notNull(),
    pipelineVersion: text("pipeline_version"),
    triggerType: varchar("trigger_type", { length: 20 }).$type<"chat" | "api" | "job" | "cron" | "webhook" | "tool">().default("api").notNull(),

    status: varchar("status", { length: 20 }).$type<"running" | "succeeded" | "failed" | "cancelled">().default("running").notNull(),

    startedAt: timestamp("started_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),

    traceId: text("trace_id"),
    spanId: text("span_id"),

    metadata: jsonb("metadata").default({}).notNull(),
});

export const agentRunEvents = pgTable("agent_run_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
        .references(() => agentRuns.id, { onDelete: "cascade" })
        .notNull(),

    timestamp: timestamp("timestamp").defaultNow().notNull(),
    durationMs: integer("duration_ms"),

    eventType: text("event_type").notNull(),
    level: varchar("level", { length: 20 }).$type<"debug" | "info" | "warn" | "error">().default("info").notNull(),

    messageId: uuid("message_id").references(() => messages.id),
    toolRunId: uuid("tool_run_id").references(() => toolRuns.id),
    promptVersionId: uuid("prompt_version_id"),

    pipelineName: text("pipeline_name"),
    stepName: text("step_name"),
    toolName: text("tool_name"),
    llmOperation: text("llm_operation"),

    data: jsonb("data").default({}).notNull(),
});

export const promptTemplates = pgTable("prompt_templates", {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").unique().notNull(),
    description: text("description"),
    owner: varchar("owner", { length: 20 }).$type<"system" | "user" | "team">().default("system").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const promptVersions = pgTable("prompt_versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
        .references(() => promptTemplates.id, { onDelete: "cascade" })
        .notNull(),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    metadata: jsonb("metadata").default({}).notNull(),
});

// Relations
export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
    session: one(sessions, { fields: [agentRuns.sessionId], references: [sessions.id] }),
    user: one(users, { fields: [agentRuns.userId], references: [users.id] }),
    events: many(agentRunEvents),
}));

export const agentRunEventsRelations = relations(agentRunEvents, ({ one }) => ({
    run: one(agentRuns, { fields: [agentRunEvents.runId], references: [agentRuns.id] }),
    message: one(messages, { fields: [agentRunEvents.messageId], references: [messages.id] }),
    toolRun: one(toolRuns, { fields: [agentRunEvents.toolRunId], references: [toolRuns.id] }),
    promptVersion: one(promptVersions, { fields: [agentRunEvents.promptVersionId], references: [promptVersions.id] }),
}));

export const promptTemplatesRelations = relations(promptTemplates, ({ many }) => ({
    versions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one }) => ({
    template: one(promptTemplates, { fields: [promptVersions.templateId], references: [promptTemplates.id] }),
    createdBy: one(users, { fields: [promptVersions.createdByUserId], references: [users.id] }),
}));
