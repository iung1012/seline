/**
 * queries.ts — Aggregator for PostgreSQL-compatible queries
 *
 * This file provides a single import point for all database query functions,
 * routing them to the topic-specific modules. 
 *
 * All functions are designed for multi-tenant SaaS operation.
 */

export * from "./queries-users";
export * from "./queries-sessions";
export * from "./queries-messages";
export * from "./queries-web-browse";
export * from "./queries-channel";
export * from "./queries-documents";
export * from "./queries-user-settings";
