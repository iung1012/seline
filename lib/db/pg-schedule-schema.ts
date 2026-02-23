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
import { relations } from "drizzle-orm";
import { users, sessions } from "./pg-schema";
import { characters } from "./pg-character-schema";
import { skills } from "./pg-skills-schema";

export const scheduledTasks = pgTable("scheduled_tasks", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),
    characterId: uuid("character_id")
        .references(() => characters.id, { onDelete: "cascade" })
        .notNull(),

    name: text("name").notNull(),
    description: text("description"),

    scheduleType: varchar("schedule_type", { length: 20 }).$type<"cron" | "interval" | "once">().default("cron").notNull(),
    cronExpression: text("cron_expression"),
    intervalMinutes: integer("interval_minutes"),
    scheduledAt: timestamp("scheduled_at"),
    timezone: text("timezone").default("UTC").notNull(),

    initialPrompt: text("initial_prompt").notNull(),
    promptVariables: jsonb("prompt_variables").default({}).notNull(),
    contextSources: jsonb("context_sources").default([]).notNull(),

    enabled: boolean("enabled").default(true).notNull(),
    maxRetries: integer("max_retries").default(3).notNull(),
    timeoutMs: integer("timeout_ms").default(300000).notNull(),
    priority: varchar("priority", { length: 20 }).$type<"high" | "normal" | "low">().default("normal").notNull(),
    status: varchar("status", { length: 20 }).$type<"draft" | "active" | "paused" | "archived">().default("active").notNull(),

    pausedAt: timestamp("paused_at"),
    pausedUntil: timestamp("paused_until"),
    pauseReason: text("pause_reason"),

    deliveryMethod: varchar("delivery_method", { length: 20 }).$type<"session" | "email" | "slack" | "webhook" | "channel">().default("session").notNull(),
    deliveryConfig: jsonb("delivery_config").default({}).notNull(),

    resultSessionId: uuid("result_session_id").references(() => sessions.id),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    createNewSessionPerRun: boolean("create_new_session_per_run").default(true).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
});

export const scheduledTaskRuns = pgTable("scheduled_task_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
        .references(() => scheduledTasks.id, { onDelete: "cascade" })
        .notNull(),

    agentRunId: uuid("agent_run_id"),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),

    status: varchar("status", { length: 20 }).$type<"pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timeout">().default("pending").notNull(),

    scheduledFor: timestamp("scheduled_for").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    durationMs: integer("duration_ms"),

    attemptNumber: integer("attempt_number").default(1).notNull(),

    resultSummary: text("result_summary"),
    error: text("error"),

    resolvedPrompt: text("resolved_prompt"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const scheduledTasksRelations = relations(scheduledTasks, ({ one, many }) => ({
    user: one(users, { fields: [scheduledTasks.userId], references: [users.id] }),
    character: one(characters, { fields: [scheduledTasks.characterId], references: [characters.id] }),
    resultSession: one(sessions, { fields: [scheduledTasks.resultSessionId], references: [sessions.id] }),
    skill: one(skills, { fields: [scheduledTasks.skillId], references: [skills.id] }),
    runs: many(scheduledTaskRuns),
}));

export const scheduledTaskRunsRelations = relations(scheduledTaskRuns, ({ one }) => ({
    task: one(scheduledTasks, { fields: [scheduledTaskRuns.taskId], references: [scheduledTasks.id] }),
    session: one(sessions, { fields: [scheduledTaskRuns.sessionId], references: [sessions.id] }),
}));
// Types
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
export type ScheduledTaskRun = typeof scheduledTaskRuns.$inferSelect;
export type NewScheduledTaskRun = typeof scheduledTaskRuns.$inferInsert;

export type ContextSource = {
    type: "file" | "web" | "text" | "folder";
    value: string;
    options?: Record<string, any>;
};

export type DeliveryMethod = "session" | "email" | "slack" | "webhook" | "channel";

export type DeliveryConfig = Record<string, any>;
