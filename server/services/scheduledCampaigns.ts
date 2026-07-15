/**
 * Scheduled Campaign Service
 *
 * Automatically executes campaigns at their scheduled time
 * Supports one-time and recurring campaigns
 */

import { getDb } from "../db";
import { campaigns } from "../../drizzle/schema";
import { and, asc, eq, lte } from "drizzle-orm";
import { addDiscoveryToQueue } from "./inMemoryQueue";
import { recordReadinessSnapshot } from "./outreachLedger";
import * as database from "../db";
import {
  getScheduledExecutionDecision,
  parseCampaignSearchCriteria,
} from "./campaignSafety";

// Check for scheduled campaigns every minute
const CHECK_INTERVAL = 60 * 1000; // 1 minute
const DEFAULT_SCHEDULED_CAMPAIGN_BATCH_SIZE = 20;
const SCHEDULED_CAMPAIGN_BATCH_SIZE = getScheduledCampaignBatchSize();

let schedulerInterval: NodeJS.Timeout | null = null;
let isCheckInProgress = false;

/**
 * Start the campaign scheduler
 */
export function startCampaignScheduler() {
  if (schedulerInterval) {
    console.log("[ScheduledCampaigns] Scheduler already running");
    return;
  }

  console.log("[ScheduledCampaigns] Starting campaign scheduler");

  // Run immediately
  checkScheduledCampaigns();

  // Then run every minute
  schedulerInterval = setInterval(checkScheduledCampaigns, CHECK_INTERVAL);
}

/**
 * Stop the campaign scheduler
 */
export function stopCampaignScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[ScheduledCampaigns] Scheduler stopped");
  }
}

/**
 * Check for campaigns that need to be executed
 */
async function checkScheduledCampaigns() {
  if (isCheckInProgress) {
    console.log("[ScheduledCampaigns] Scheduler check already in progress");
    return;
  }

  isCheckInProgress = true;

  try {
    const db = await getDb();
    if (!db) {
      console.error("[ScheduledCampaigns] Database not available");
      return;
    }

    const now = new Date();

    // Find scheduled campaigns that are ready to execute
    const scheduledCampaigns = await db
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, "scheduled"),
          eq(campaigns.isScheduled, 1),
          lte(campaigns.nextExecutionAt, now)
        )
      )
      .orderBy(asc(campaigns.nextExecutionAt))
      .limit(SCHEDULED_CAMPAIGN_BATCH_SIZE);

    if (scheduledCampaigns.length === 0) {
      return;
    }

    console.log(
      `[ScheduledCampaigns] Found ${scheduledCampaigns.length} campaigns to execute`
    );

    for (const campaign of scheduledCampaigns) {
      try {
        await executeCampaign(campaign);
      } catch (error) {
        console.error(
          `[ScheduledCampaigns] Error executing campaign ${campaign.id}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "[ScheduledCampaigns] Error checking scheduled campaigns:",
      error
    );
  } finally {
    isCheckInProgress = false;
  }
}

function getScheduledCampaignBatchSize() {
  const raw = process.env.SCHEDULED_CAMPAIGN_BATCH_SIZE;
  if (!raw) {
    return DEFAULT_SCHEDULED_CAMPAIGN_BATCH_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 200) {
    console.warn(
      `[ScheduledCampaigns] Invalid SCHEDULED_CAMPAIGN_BATCH_SIZE="${raw}", using ${DEFAULT_SCHEDULED_CAMPAIGN_BATCH_SIZE}`
    );
    return DEFAULT_SCHEDULED_CAMPAIGN_BATCH_SIZE;
  }

  return parsed;
}

/**
 * Execute a scheduled campaign
 */
async function executeCampaign(campaign: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log(
    `[ScheduledCampaigns] Executing campaign ${campaign.id}: ${campaign.title}`
  );

  const readiness = await recordReadinessSnapshot(campaign, campaign.userId);
  if (readiness.status === "blocked") {
    await database.createAuditEvent({
      userId: campaign.userId,
      campaignId: campaign.id,
      entityType: "campaign",
      entityId: campaign.id,
      action: "campaign.discovery_blocked_readiness",
      actor: "system",
      source: "scheduledCampaigns.executeCampaign",
      riskLevel: "medium",
      afterState: JSON.stringify({
        blockers: readiness.blockers,
        status: readiness.status,
      }),
    });
    throw new Error(
      `Scheduled campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`
    );
  }

  // Parse target platforms and search criteria
  const targetPlatforms = JSON.parse(campaign.targetPlatforms);
  const searchCriteria = parseCampaignSearchCriteria(campaign.searchCriteria);
  const scheduleDecision = getScheduledExecutionDecision(searchCriteria);

  if (scheduleDecision.quietHoursActive) {
    await db
      .update(campaigns)
      .set({
        nextExecutionAt: scheduleDecision.nextAllowedExecutionAt,
        status: "scheduled",
      })
      .where(eq(campaigns.id, campaign.id));
    await database.createAuditEvent({
      userId: campaign.userId,
      campaignId: campaign.id,
      entityType: "campaign",
      entityId: campaign.id,
      action: "campaign.discovery_deferred_quiet_hours",
      actor: "system",
      source: "scheduledCampaigns.executeCampaign",
      riskLevel: "low",
      afterState: JSON.stringify({
        quietHoursStart: scheduleDecision.safetyPolicy.quietHoursStart,
        quietHoursEnd: scheduleDecision.safetyPolicy.quietHoursEnd,
        nextAllowedExecutionAt:
          scheduleDecision.nextAllowedExecutionAt.toISOString(),
      }),
    });
    console.log(
      `[ScheduledCampaigns] Campaign ${campaign.id} deferred until ${scheduleDecision.nextAllowedExecutionAt.toISOString()} due to quiet hours`
    );
    return;
  }

  // Get platform IDs
  const { getAllPlatforms } = await import("../db");
  const allPlatforms = await getAllPlatforms();
  const platformIds = allPlatforms
    .filter(
      (p: any) =>
        targetPlatforms.includes(p.id) || targetPlatforms.includes(p.name)
    )
    .map((p: any) => p.id);

  // Queue discovery jobs for each platform
  for (const platformId of platformIds) {
    await addDiscoveryToQueue({
      campaignId: campaign.id,
      platformId,
      searchCriteria,
      userId: campaign.userId,
    });
  }

  // Update campaign status and execution times
  const updates: any = {
    status: "active",
    lastExecutedAt: new Date(),
  };

  // Handle recurring campaigns
  if (campaign.isRecurring === 1 && campaign.recurringPattern) {
    const nextExecution = calculateNextExecution(campaign.recurringPattern);
    updates.nextExecutionAt = nextExecution;
    updates.status = "scheduled"; // Keep as scheduled for next run

    console.log(
      `[ScheduledCampaigns] Campaign ${campaign.id} will run again at ${nextExecution}`
    );
  } else {
    // One-time campaign - mark as completed after execution
    updates.nextExecutionAt = null;
    updates.status = "active"; // Will be marked completed after discovery finishes
  }

  await db.update(campaigns).set(updates).where(eq(campaigns.id, campaign.id));

  console.log(
    `[ScheduledCampaigns] Campaign ${campaign.id} executed successfully`
  );
}

/**
 * Calculate next execution time based on recurring pattern
 */
export function calculateNextExecution(pattern: string): Date {
  const now = new Date();

  switch (pattern) {
    case "daily":
      // Run at 9 AM next day
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return tomorrow;

    case "weekly":
      // Run at 9 AM next Monday
      const nextWeek = new Date(now);
      const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
      nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
      nextWeek.setHours(9, 0, 0, 0);
      return nextWeek;

    case "monthly":
      // Run at 9 AM on the 1st of next month
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);
      nextMonth.setHours(9, 0, 0, 0);
      return nextMonth;

    default:
      // Default to daily
      const defaultNext = new Date(now);
      defaultNext.setDate(defaultNext.getDate() + 1);
      defaultNext.setHours(9, 0, 0, 0);
      return defaultNext;
  }
}

/**
 * Get optimal scheduling suggestions
 */
export function getOptimalTimeSuggestions(): Array<{
  label: string;
  date: Date;
}> {
  const now = new Date();
  const suggestions: Array<{ label: string; date: Date }> = [];

  // Tomorrow at 9 AM (weekday morning)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Tomorrow at 9:00 AM", date: tomorrow });

  // Next Monday at 9 AM
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Next Monday at 9:00 AM", date: nextMonday });

  // Next week at 9 AM
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(9, 0, 0, 0);
  suggestions.push({ label: "Next week at 9:00 AM", date: nextWeek });

  return suggestions;
}

// Start scheduler when module is loaded
startCampaignScheduler();

// Cleanup on process exit
process.on("SIGINT", stopCampaignScheduler);
process.on("SIGTERM", stopCampaignScheduler);
