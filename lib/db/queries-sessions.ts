import { db } from "./client";
import { sessions, agentRuns, messages } from "./schema";
import type { NewSession, Session } from "./schema";
import { eq, desc, asc, and, lt, sql, ilike, inArray } from "drizzle-orm";

export type SessionMetadataShape = {
  characterId?: string;
  channelType?: "whatsapp" | "telegram" | "slack";
};

export interface ListSessionsPaginatedParams {
  userId: string;
  characterId?: string;
  cursor?: Date | string; // Cursor could be Date now
  limit?: number;
  search?: string;
  channelType?: "whatsapp" | "telegram" | "slack";
  dateRange?: "today" | "week" | "month" | "all";
  status?: "active" | "archived";
}

export interface ListSessionsPaginatedResult {
  sessions: (Session & { hasActiveRun?: boolean })[];
  nextCursor: Date | null;
  totalCount: number;
}

export function extractSessionMetadataColumns(metadata: unknown) {
  const meta = (metadata ?? {}) as SessionMetadataShape;
  return {
    characterId: meta.characterId ?? null,
    channelType: meta.channelType ?? null,
  };
}

export async function createSession(data: NewSession) {
  const metaColumns = extractSessionMetadataColumns(data.metadata);
  const [session] = await db.insert(sessions).values({
    ...data,
    ...metaColumns,
  }).returning();
  return session;
}

export async function getSession(id: string, userId?: string) {
  const conditions = [eq(sessions.id, id)];
  if (userId) {
    conditions.push(eq(sessions.userId, userId));
  }
  return db.query.sessions.findFirst({
    where: and(...conditions),
  });
}

export async function getSessionWithMessages(id: string) {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });

  if (!session) return null;

  const msgs = await db.query.messages.findMany({
    where: eq(messages.sessionId, id),
    orderBy: asc(messages.createdAt),
  });

  return { session, messages: msgs };
}

export async function listSessions(userId?: string, limit = 100) {
  const conditions = userId ? eq(sessions.userId, userId) : undefined;

  return db.query.sessions.findMany({
    where: conditions ? and(conditions, eq(sessions.status, "active")) : eq(sessions.status, "active"),
    orderBy: desc(sessions.updatedAt),
    limit,
  });
}

export async function getSessionByCharacterId(userId: string, characterId: string): Promise<Session | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  return result[0] || null;
}

export async function getSessionByMetadataKey(
  userId: string,
  type: string,
  key: string
): Promise<Session | null> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        sql`${sessions.metadata}->>'type' = ${type}`,
        sql`${sessions.metadata}->>'key' = ${key}`
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(1);

  return result[0] || null;
}

export async function listSessionsByCharacterId(
  userId: string,
  characterId: string,
  limit = 100
): Promise<Session[]> {
  const result = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    )
    .orderBy(desc(sessions.updatedAt))
    .limit(limit);

  return result;
}

export async function getCharacterSessionCount(
  userId: string,
  characterId: string
): Promise<number> {
  const result = await db
    .select({ count: sql<string>`count(*)` })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, "active"),
        eq(sessions.characterId, characterId)
      )
    );

  return parseInt(result[0]?.count || "0", 10);
}

export async function getOrCreateCharacterSession(
  userId: string,
  characterId: string,
  characterName: string
): Promise<{ session: Session; isNew: boolean }> {
  const existingSession = await getSessionByCharacterId(userId, characterId);

  if (existingSession) {
    return { session: existingSession, isNew: false };
  }

  const newSession = await createSession({
    title: `Chat with ${characterName}`,
    userId,
    metadata: { characterId, characterName },
  });

  return { session: newSession, isNew: true };
}

export async function listSessionsPaginated(
  params: ListSessionsPaginatedParams
): Promise<ListSessionsPaginatedResult> {
  const pageSize = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const statusFilter = params.status ?? "active";
  const baseConditions = [eq(sessions.userId, params.userId), eq(sessions.status, statusFilter)];

  if (params.characterId) {
    baseConditions.push(eq(sessions.characterId, params.characterId));
  }
  if (params.search) {
    baseConditions.push(ilike(sessions.title, `%${params.search}%`));
  }
  if (params.channelType) {
    baseConditions.push(eq(sessions.channelType, params.channelType));
  }

  if (params.dateRange && params.dateRange !== "all") {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const threshold =
      params.dateRange === "today"
        ? new Date(now.getTime() - dayMs)
        : params.dateRange === "week"
          ? new Date(now.getTime() - 7 * dayMs)
          : new Date(now.getTime() - 30 * dayMs);
    baseConditions.push(sql`${sessions.updatedAt} >= ${threshold}`);
  }

  const pageConditions = [...baseConditions];
  if (params.cursor) {
    const cursorDate = typeof params.cursor === "string" ? new Date(params.cursor) : params.cursor;
    pageConditions.push(lt(sessions.updatedAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(and(...pageConditions))
    .orderBy(desc(sessions.updatedAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? page[page.length - 1]?.updatedAt ?? null : null;

  let sessionsWithStatus = page as (Session & { hasActiveRun?: boolean })[];
  if (page.length > 0) {
    const sessionIds = page.map((s) => s.id);
    const activeRuns = await db
      .select({ sessionId: agentRuns.sessionId })
      .from(agentRuns)
      .where(and(inArray(agentRuns.sessionId, sessionIds), eq(agentRuns.status, "running")));

    const activeSessionIds = new Set(activeRuns.map((r) => r.sessionId));
    sessionsWithStatus = page.map((s) => ({
      ...s,
      hasActiveRun: activeSessionIds.has(s.id),
    })) as (Session & { hasActiveRun?: boolean })[];
  }

  const countResult = await db
    .select({ count: sql<string>`count(*)` })
    .from(sessions)
    .where(and(...baseConditions));

  return {
    sessions: sessionsWithStatus,
    nextCursor,
    totalCount: parseInt(countResult[0]?.count ?? "0", 10),
  };
}

export async function updateSession(id: string, data: Partial<NewSession>, userId?: string) {
  const metadataColumns = data.metadata !== undefined
    ? extractSessionMetadataColumns(data.metadata)
    : {};

  const conditions = [eq(sessions.id, id)];
  if (userId) {
    conditions.push(eq(sessions.userId, userId));
  }

  const [session] = await db
    .update(sessions)
    .set({
      ...data,
      ...metadataColumns,
      updatedAt: new Date()
    } as any)
    .where(and(...conditions))
    .returning();
  return session;
}

export async function updateSessionSummary(
  id: string,
  summary: string,
  summaryUpToMessageId: string
) {
  return updateSession(id, { summary, summaryUpToMessageId });
}
