import { db } from "./client";
import { sessions } from "./schema";
import { and, eq, lt, sql, isNull, or } from "drizzle-orm";

export async function runSessionMaintenance(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Purge deleted sessions
    const deletedResult = await db
      .delete(sessions)
      .where(
        and(
          eq(sessions.status, 'deleted'),
          lt(sessions.updatedAt, thirtyDaysAgo)
        )
      )
      .returning({ id: sessions.id });

    if (deletedResult.length > 0) {
      console.log(`[Postgres Maintenance] Purged ${deletedResult.length} deleted session(s) older than 30 days`);
    }

    // Archive empty inactive sessions
    const archivedResult = await db
      .update(sessions)
      .set({
        status: 'archived',
        updatedAt: new Date()
      })
      .where(
        and(
          eq(sessions.status, 'active'),
          or(isNull(sessions.messageCount), eq(sessions.messageCount, 0)),
          lt(sessions.updatedAt, ninetyDaysAgo)
        )
      )
      .returning({ id: sessions.id });

    if (archivedResult.length > 0) {
      console.log(`[Postgres Maintenance] Archived ${archivedResult.length} empty inactive session(s)`);
    }
  } catch (error) {
    console.warn("[Postgres Maintenance] Session maintenance failed:", error);
  }
}
