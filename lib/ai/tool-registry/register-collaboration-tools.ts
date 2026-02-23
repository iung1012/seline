import type { ToolMetadata } from "./types";
import { ToolRegistry } from "./registry";
import { createScheduleTaskTool } from "../tools/schedule-task-tool";
import { createRunSkillTool } from "../tools/run-skill-tool";
import { createUpdateSkillTool } from "../tools/update-skill-tool";
import { createMemorizeTool } from "../tools/memorize-tool";
import { createCalculatorTool } from "../tools/calculator-tool";
import { createUpdatePlanTool } from "../tools/update-plan-tool";

export function registerCollaborationTools(registry: ToolRegistry): void {
  // Schedule Task Tool - Schedule tasks for future execution
  registry.register(
    "scheduleTask",
    {
      displayName: "Schedule Task",
      category: "scheduling",
      keywords: [
        "schedule",
        "task",
        "cron",
        "timer",
        "reminder",
        "future",
        "recurring",
        "automation",
        "daily",
        "weekly",
        "hourly",
        "interval",
        "scheduled",
        "job",
        "automate",
      ],
      shortDescription:
        "Schedule tasks for future execution (one-time, recurring, or interval-based)",
      fullInstructions: `## Schedule Task

Schedule future tasks (cron/interval/once). Task runs with agent's full context and tools.

**Types:** cron (\`cronExpression\`), interval (\`intervalMinutes\`), once (\`scheduledAt\` ISO timestamp).

**Cron patterns:** \`0 9 * * 1-5\` (9am weekdays), \`0 0 * * *\` (midnight daily), \`*/30 * * * *\` (every 30min), \`0 0 1 * *\` (monthly).

**Template variables in prompts:** \`{{NOW}}\`, \`{{TODAY}}\`, \`{{YESTERDAY}}\`, \`{{WEEKDAY}}\`, \`{{MONTH}}\`, \`{{LAST_7_DAYS}}\`, \`{{LAST_30_DAYS}}\` — resolved at execution time.

**Timezone:** Always use IANA format (e.g., "Europe/Berlin"). The tool auto-converts common formats: GMT+1, CET, EST, city names ("Berlin", "Tokyo"). If ambiguous, ask the user to confirm their city.

**Delivery channel:** Use \`deliveryChannel: "auto"\` (default) to deliver results to the same channel the user is chatting from (e.g., Telegram → Telegram). Override with "app", "telegram", "slack", "whatsapp".

**Calendar mirroring:** Set \`mirrorToCalendar: true\` to also create a Google Calendar event via configured MCP. Requires a calendar MCP server (e.g., Composio). Use \`calendarDurationMinutes\` for event length (default: 15).`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createScheduleTaskTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Skills runtime: unified discovery/inspect/run for DB + plugin skills
  registry.register(
    "runSkill",
    {
      displayName: "Run Skill",
      category: "utility",
      keywords: ["run skill", "inspect skill", "list skills", "execute skill", "skill by id", "skill by name"],
      shortDescription: "Unified skill runtime: list, inspect full content, and run DB/plugin skills",
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, userId, characterId }) =>
      createRunSkillTool({
        sessionId: sessionId || "UNSCOPED",
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Skills runtime: unified create/patch/replace/metadata/copy/archive mutations
  registry.register(
    "updateSkill",
    {
      displayName: "Update Skill",
      category: "utility",
      keywords: ["update skill", "create skill", "patch skill", "replace skill", "copy skill", "archive skill", "skill feedback"],
      shortDescription: "Unified skill mutation tool with patch-first editing and version checks",
      loading: { deferLoading: true },
      requiresSession: false,
    } satisfies ToolMetadata,
    ({ userId, characterId }) =>
      createUpdateSkillTool({
        userId: userId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Memorize Tool - Save memories on demand
  registry.register(
    "memorize",
    {
      displayName: "Memorize",
      category: "utility",
      keywords: [
        "memorize", "remember", "memory", "save", "note",
        "preference", "fact", "learn", "store",
        "always", "never", "my name", "I prefer",
        "note for future", "keep in mind",
      ],
      shortDescription:
        "Save a fact, preference, or instruction to remember across conversations",
      fullInstructions: `## Memorize

Save memories when the user says "remember that...", "memorize this", "note for future reference", "my name is...", "I prefer...", "always do X", etc.

**Guidelines:**
- One fact per memory — keep it concise and specific
- Don't duplicate existing memories (tool checks automatically)
- Pick the best category or omit to default to domain_knowledge
- Categories: visual_preferences, communication_style, workflow_patterns, domain_knowledge, business_rules
- Memories are immediately active in all future conversations`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId, characterId }) =>
      createMemorizeTool({
        sessionId: sessionId || "UNSCOPED",
        characterId: characterId || "UNSCOPED",
      })
  );

  // Calculator Tool - Safe mathematical calculations
  registry.register(
    "calculator",
    {
      displayName: "Calculator",
      category: "utility",
      keywords: [
        "calculate",
        "calculator",
        "math",
        "arithmetic",
        "compute",
        "add",
        "subtract",
        "multiply",
        "divide",
        "sum",
        "percentage",
        "percent",
        "tax",
        "interest",
        "compound",
        "statistics",
        "mean",
        "median",
        "sqrt",
        "power",
        "exponent",
        "trigonometry",
        "sin",
        "cos",
        "convert",
        "unit",
        "formula",
      ],
      shortDescription:
        "Perform accurate mathematical calculations - arithmetic, statistics, trigonometry, unit conversions",
      fullInstructions: `## Calculator

Use instead of doing math yourself — returns deterministic, accurate results.

**Supports:** arithmetic, trig (radians), log, constants (pi/e/phi), statistics (mean/median/std), units ("5 miles to km"), matrix, complex numbers.

**Example:** \`calculator({ expression: "10000 * (1 + 0.07)^30", precision: 2 })\``,
      loading: { deferLoading: true },
      requiresSession: false,
    } satisfies ToolMetadata,
    () => createCalculatorTool()
  );

  // Update Plan Tool - Create or update a visible task plan
  registry.register(
    "updatePlan",
    {
      displayName: "Update Plan",
      category: "utility",
      keywords: [
        "plan", "update plan", "task plan", "steps", "todo", "progress",
        "checklist", "roadmap", "track", "status", "milestone",
      ],
      shortDescription:
        "Create or update a visible task plan with step statuses across the conversation",
      fullInstructions: `## Update Plan

Creates or updates a visible task plan. First call creates; subsequent calls update.

**Quick decision:**
- No plan yet → call with steps and text for each (mode="replace" is default)
- Update step status → pass only its id + new status, mode="merge" (text is optional — existing text preserved)
- Change step text → pass id + new text + status, mode="merge"
- Redo entirely → new steps with text, mode="replace"

**IMPORTANT for merge updates:** Only send the steps that changed. Do NOT resend all steps.
Example: \`{ "steps": [{"id": "step_abc", "status": "completed"}], "mode": "merge" }\`

**Constraints:** Max 20 steps. Only 1 step can be "in_progress" at a time. Use returned step ids for merge updates.`,
      loading: { deferLoading: true },
      requiresSession: true,
    } satisfies ToolMetadata,
    ({ sessionId }) => createUpdatePlanTool({ sessionId: sessionId || "UNSCOPED" })
  );

}
