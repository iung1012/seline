import { db } from "./client";
import { sessions, messages, toolRuns } from "./schema";
import type { NewMessage, NewToolRun } from "./schema";
import { eq, asc, and, sql, or, inArray } from "drizzle-orm";

// Messages
export async function createMessage(data: NewMessage) {
  try {
    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();

    if (message) {
      const tokenCount = typeof message.tokenCount === "number" ? message.tokenCount : 0;
      // In PostgreSQL, updatedAt and lastMessageAt are updated via code or DB default
      // If code provides it, it must be a Date
      await db
        .update(sessions)
        .set({
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          messageCount: sql`${sessions.messageCount} + 1`,
          totalTokenCount: sql`${sessions.totalTokenCount} + ${tokenCount}`,
        })
        .where(eq(sessions.id, data.sessionId));
    }

    return message;
  } catch (error) {
    if ((error as Error).message?.includes('unique constraint')) {
      return undefined;
    }
    throw error;
  }
}

export async function getMessages(sessionId: string, userId?: string) {
  if (userId) {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
    });
    if (!session) throw new Error("Unauthorized or session not found");
  }

  return db.query.messages.findMany({
    where: eq(messages.sessionId, sessionId),
    orderBy: [
      asc(sql`case when ${messages.orderingIndex} is null then 1 else 0 end`),
      asc(messages.orderingIndex),
      asc(messages.createdAt),
    ],
  });
}

export async function updateMessage(
  messageId: string,
  data: Partial<Pick<NewMessage, "content" | "metadata" | "model" | "tokenCount">>
) {
  const existing = await db.query.messages.findFirst({
    where: eq(messages.id, messageId),
  });
  const [updated] = await db
    .update(messages)
    .set(data)
    .where(eq(messages.id, messageId))
    .returning();

  if (updated) {
    const previousTokenCount = existing?.tokenCount ?? 0;
    const nextTokenCount = updated.tokenCount ?? 0;
    const delta = nextTokenCount - previousTokenCount;
    await db
      .update(sessions)
      .set({
        updatedAt: new Date(),
        totalTokenCount: sql`${sessions.totalTokenCount} + ${delta}`,
      })
      .where(eq(sessions.id, updated.sessionId));
  }

  return updated;
}

export async function getToolResultsForSession(sessionId: string): Promise<Map<string, unknown>> {
  const toolResults = new Map<string, unknown>();

  const allMessages = await db.query.messages.findMany({
    where: and(
      eq(messages.sessionId, sessionId),
      or(
        eq(messages.role, "tool"),
        eq(messages.role, "assistant")
      )
    ),
    orderBy: asc(messages.createdAt),
  });

  for (const msg of allMessages) {
    const content = msg.content as Array<{ type: string; toolCallId?: string; result?: unknown }> | null;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (part.type === "tool-result" && part.toolCallId) {
        toolResults.set(part.toolCallId, part.result);
      }
    }

    if (msg.role === "tool" && msg.toolCallId && content.length > 0) {
      const firstPart = content[0] as { result?: unknown };
      if (firstPart.result !== undefined) {
        toolResults.set(msg.toolCallId, firstPart.result);
      }
    }
  }

  return toolResults;
}

export async function getNonCompactedMessages(sessionId: string) {
  return db.query.messages.findMany({
    where: and(
      eq(messages.sessionId, sessionId),
      eq(messages.isCompacted, false)
    ),
    orderBy: [
      asc(sql`case when ${messages.orderingIndex} is null then 1 else 0 end`),
      asc(messages.orderingIndex),
      asc(messages.createdAt),
    ],
  });
}

export async function markMessagesAsCompacted(
  sessionId: string,
  beforeMessageId: string
) {
  const sessionMessages = await getNonCompactedMessages(sessionId);
  const targetIndex = sessionMessages.findIndex((message) => message.id === beforeMessageId);
  if (targetIndex < 0) return;

  const idsToCompact = sessionMessages.slice(0, targetIndex + 1).map((message) => message.id);
  await markMessagesAsCompactedByIds(sessionId, idsToCompact);
}

export async function markMessagesAsCompactedByIds(
  sessionId: string,
  messageIds: string[],
  userId?: string
): Promise<number> {
  if (messageIds.length === 0) return 0;

  if (userId) {
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), eq(sessions.userId, userId)),
    });
    if (!session) throw new Error("Unauthorized or session not found");
  }

  const result = await db
    .update(messages)
    .set({ isCompacted: true })
    .where(
      and(
        eq(messages.sessionId, sessionId),
        inArray(messages.id, messageIds)
      )
    )
    .returning();

  return result.length;
}

// Tool Runs
export async function createToolRun(data: NewToolRun) {
  const [toolRun] = await db.insert(toolRuns).values(data).returning();
  return toolRun;
}

export async function updateToolRun(
  id: string,
  data: Partial<Omit<NewToolRun, "id" | "sessionId">>
) {
  const [toolRun] = await db
    .update(toolRuns)
    .set(data)
    .where(eq(toolRuns.id, id))
    .returning();
  return toolRun;
}

export async function getToolRun(id: string) {
  return db.query.toolRuns.findFirst({
    where: eq(toolRuns.id, id),
  });
}
