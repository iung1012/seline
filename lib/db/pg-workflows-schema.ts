import {
    pgTable,
    text,
    timestamp,
    uuid,
    jsonb,
    index,
    uniqueIndex,
    varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./pg-schema";
import { characters } from "./pg-character-schema";

export const agentWorkflows = pgTable(
    "agent_workflows",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
        name: text("name").notNull(),
        initiatorId: uuid("initiator_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
        status: varchar("status", { length: 20 }).$type<"active" | "paused" | "archived">().default("active").notNull(),
        metadata: jsonb("metadata").default({}).notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        userStatusIdx: index("idx_agent_workflows_user_status").on(table.userId, table.status),
        initiatorIdx: index("idx_agent_workflows_initiator").on(table.initiatorId),
    })
);

export const agentWorkflowMembers = pgTable(
    "agent_workflow_members",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workflowId: uuid("workflow_id")
            .references(() => agentWorkflows.id, { onDelete: "cascade" })
            .notNull(),
        agentId: uuid("agent_id")
            .references(() => characters.id, { onDelete: "cascade" })
            .notNull(),
        role: varchar("role", { length: 20 }).$type<"initiator" | "subagent">().notNull(),
        sourcePath: text("source_path"),
        metadataSeed: jsonb("metadata_seed"),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => ({
        workflowAgentUnique: uniqueIndex("idx_agent_workflow_members_workflow_agent").on(
            table.workflowId,
            table.agentId
        ),
        agentIdx: index("idx_agent_workflow_members_agent").on(table.agentId),
        workflowRoleIdx: index("idx_agent_workflow_members_workflow_role").on(table.workflowId, table.role),
    })
);

export const agentWorkflowsRelations = relations(agentWorkflows, ({ one, many }) => ({
    user: one(users, {
        fields: [agentWorkflows.userId],
        references: [users.id],
    }),
    initiator: one(characters, {
        fields: [agentWorkflows.initiatorId],
        references: [characters.id],
    }),
    members: many(agentWorkflowMembers),
}));

export const agentWorkflowMembersRelations = relations(agentWorkflowMembers, ({ one }) => ({
    workflow: one(agentWorkflows, {
        fields: [agentWorkflowMembers.workflowId],
        references: [agentWorkflows.id],
    }),
    agent: one(characters, {
        fields: [agentWorkflowMembers.agentId],
        references: [characters.id],
    }),
}));
