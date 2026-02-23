/**
 * Scheduler Service
 *
 * Cron-based job scheduling with timezone support.
 * Manages scheduled tasks and queues them for execution.
 */

import { CronJob } from "cron";
import { db } from "@/lib/db/client";
import { scheduledTasks, scheduledTaskRuns } from "@/lib/db/schema";
import type { ScheduledTask, ContextSource } from "@/lib/db/schema";
import { eq, and, lte, isNull, or } from "drizzle-orm";
import { TaskQueue } from "./task-queue";
import { resolveTimezone } from "@/lib/utils/timezone";

interface SchedulerConfig {
  checkIntervalMs?: number;  // How often to check for due tasks (default: 60s)
  maxConcurrentTasks?: number;
  enabled?: boolean;
}

export class SchedulerService {
  private jobs: Map<string, CronJob> = new Map();
  private taskQueue: TaskQueue;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private config: Required<SchedulerConfig>;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 60_000,
      maxConcurrentTasks: config.maxConcurrentTasks ?? 1,
      enabled: config.enabled ?? true,
    };
    this.taskQueue = new TaskQueue({
      maxConcurrent: this.config.maxConcurrentTasks,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[Scheduler] Already running, skipping start");
      return;
    }
    if (!this.config.enabled) {
      console.log("[Scheduler] Scheduler disabled, skipping start");
      return;
    }
    this.isRunning = true;

    console.log("[Scheduler] Starting scheduler service...");

    await this.loadSchedules();

    this.checkInterval = setInterval(
      () => this.checkAndQueueDueTasks(),
      this.config.checkIntervalMs
    );

    this.taskQueue.start();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log("[Scheduler] Stopping scheduler service");

    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    await this.taskQueue.stop();

    this.isRunning = false;
  }

  async loadSchedules(): Promise<void> {
    const schedules = await db.query.scheduledTasks.findMany({
      where: and(eq(scheduledTasks.enabled, true), eq(scheduledTasks.status, 'active')),
    });

    for (const schedule of schedules) {
      this.registerSchedule(schedule as any);
    }

    console.log(`[Scheduler] Loaded ${schedules.length} active schedules`);
  }

  registerSchedule(schedule: ScheduledTask): void {
    if (this.jobs.has(schedule.id)) {
      this.jobs.get(schedule.id)?.stop();
      this.jobs.delete(schedule.id);
    }

    if (!schedule.enabled || schedule.status !== "active") return;

    const concreteTimezone = resolveTimezone(schedule.timezone);

    if (schedule.scheduleType === "cron" && schedule.cronExpression) {
      try {
        const job = new CronJob(
          schedule.cronExpression,
          () => this.triggerTask(schedule.id),
          null,
          true,
          concreteTimezone
        );
        this.jobs.set(schedule.id, job);

        const nextRun = job.nextDate().toDate();
        if (nextRun) {
          void this.updateNextRunTime(schedule.id, nextRun);
        }

        console.log(`[Scheduler] Registered cron job for "${schedule.name}" (${schedule.cronExpression}) in ${concreteTimezone}`);
      } catch (error) {
        console.error(`[Scheduler] Failed to register cron job for "${schedule.name}":`, error);
      }
    } else if (schedule.scheduleType === "once" && schedule.scheduledAt) {
      const scheduledTime = new Date(schedule.scheduledAt);
      if (scheduledTime > new Date()) {
        try {
          const job = new CronJob(
            scheduledTime,
            () => this.triggerTask(schedule.id),
            null,
            true,
            concreteTimezone
          );
          this.jobs.set(schedule.id, job);
          console.log(`[Scheduler] Registered one-time job for "${schedule.name}" at ${schedule.scheduledAt} in ${concreteTimezone}`);
        } catch (error) {
          console.error(`[Scheduler] Failed to register one-time job for "${schedule.name}":`, error);
        }
      }
    }
  }

  async triggerTask(taskId: string): Promise<void> {
    const task = await db.query.scheduledTasks.findFirst({
      where: eq(scheduledTasks.id, taskId),
      with: {
        character: true,
      } as any,
    });

    if (!task || !task.enabled || task.status !== "active") {
      console.log(`[Scheduler] Task ${taskId} not found, disabled, or not active, skipping`);
      return;
    }

    console.log(`[Scheduler] Triggering task "${task.name}"`);

    const now = new Date();
    const [run] = await db.insert(scheduledTaskRuns).values({
      taskId: task.id,
      status: "pending",
      scheduledFor: now,
      resolvedPrompt: this.resolvePromptVariables(
        task.initialPrompt,
        (task.promptVariables as Record<string, string>) || {},
        {
          agentName: (task as any).character?.name || (task as any).character?.displayName || "Agent",
          lastRunAt: task.lastRunAt ? task.lastRunAt.toISOString() : undefined,
        }
      ),
    }).returning();

    this.taskQueue.enqueue({
      runId: run.id,
      taskId: task.id,
      taskName: task.name,
      characterId: task.characterId,
      userId: task.userId,
      prompt: run.resolvedPrompt!,
      contextSources: (task.contextSources as ContextSource[]) || [],
      timeoutMs: task.timeoutMs,
      maxRetries: task.maxRetries,
      priority: task.priority as any,
      createNewSession: task.createNewSessionPerRun,
      existingSessionId: task.resultSessionId || undefined,
    });

    await db.update(scheduledTasks)
      .set({ lastRunAt: now })
      .where(eq(scheduledTasks.id, taskId));
  }

  private resolvePromptVariables(
    prompt: string,
    variables: Record<string, string>,
    context: { agentName?: string; lastRunAt?: string } = {}
  ): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const builtInVars: Record<string, string> = {
      "{{NOW}}": now.toISOString(),
      "{{TODAY}}": now.toISOString().split("T")[0],
      "{{YESTERDAY}}": yesterday.toISOString().split("T")[0],
      "{{LAST_7_DAYS}}": `${new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
      "{{LAST_30_DAYS}}": `${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
      "{{WEEKDAY}}": now.toLocaleDateString("en-US", { weekday: "long" }),
      "{{MONTH}}": now.toLocaleDateString("en-US", { month: "long" }),
      "{{AGENT_NAME}}": context.agentName || "Agent",
      "{{LAST_RUN}}": context.lastRunAt || "Never",
    };

    let resolved = prompt;
    for (const [key, value] of Object.entries(builtInVars)) {
      resolved = resolved.replaceAll(key, value);
    }
    for (const [key, value] of Object.entries(variables)) {
      resolved = resolved.replaceAll(`{{${key}}}`, value);
    }
    return resolved;
  }

  private async checkAndQueueDueTasks(): Promise<void> {
    const now = new Date();

    await this.checkPausedSchedules(now);

    const dueTasks = await db.query.scheduledTasks.findMany({
      where: and(
        eq(scheduledTasks.enabled, true),
        eq(scheduledTasks.status, 'active'),
        eq(scheduledTasks.scheduleType, "interval"),
        or(
          isNull(scheduledTasks.nextRunAt),
          lte(scheduledTasks.nextRunAt, now)
        )
      ),
    });

    for (const task of dueTasks) {
      await this.triggerTask(task.id);

      if (task.intervalMinutes) {
        const nextRun = new Date(Date.now() + task.intervalMinutes * 60 * 1000);
        await this.updateNextRunTime(task.id, nextRun);
      }
    }
  }

  private async checkPausedSchedules(now: Date): Promise<void> {
    try {
      const toResume = await db.query.scheduledTasks.findMany({
        where: and(
          eq(scheduledTasks.enabled, false),
          lte(scheduledTasks.pausedUntil, now)
        ),
      });

      for (const task of toResume) {
        if (task.pausedUntil) {
          await db.update(scheduledTasks)
            .set({
              enabled: true,
              pausedAt: null,
              pausedUntil: null,
              pauseReason: null,
              updatedAt: now,
            })
            .where(eq(scheduledTasks.id, task.id));

          this.registerSchedule({ ...task, enabled: true, pausedAt: null, pausedUntil: null, pauseReason: null } as any);
          console.log(`[Scheduler] Auto-resumed "${task.name}"`);
        }
      }
    } catch (error) {
      console.error("[Scheduler] Error checking paused schedules:", error);
    }
  }

  private async updateNextRunTime(taskId: string, nextRunAt: Date): Promise<void> {
    await db.update(scheduledTasks)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(scheduledTasks.id, taskId));
  }

  async reloadSchedule(taskId: string): Promise<void> {
    const task = await db.query.scheduledTasks.findFirst({
      where: eq(scheduledTasks.id, taskId),
    });

    if (task) {
      this.registerSchedule(task as any);
    } else {
      this.jobs.get(taskId)?.stop();
      this.jobs.delete(taskId);
    }
  }

  getStatus(): { isRunning: boolean; activeJobs: number; queueSize: number } {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      queueSize: this.taskQueue.getQueueSize(),
    };
  }

  cancelRun(runId: string): Promise<boolean> {
    return this.taskQueue.cancel(runId);
  }
}

const globalForScheduler = globalThis as typeof globalThis & {
  schedulerInstance?: SchedulerService;
  schedulerStarting?: boolean;
};

export function getScheduler(): SchedulerService {
  if (!globalForScheduler.schedulerInstance) {
    console.log("[Scheduler] Creating new SchedulerService instance");
    globalForScheduler.schedulerInstance = new SchedulerService();
  }
  return globalForScheduler.schedulerInstance;
}

export async function startScheduler(): Promise<void> {
  if (globalForScheduler.schedulerStarting) {
    console.log("[Scheduler] Start already in progress, skipping");
    return;
  }
  globalForScheduler.schedulerStarting = true;
  try {
    await getScheduler().start();
  } finally { }
}

export function stopScheduler(): Promise<void> {
  return getScheduler().stop();
}
