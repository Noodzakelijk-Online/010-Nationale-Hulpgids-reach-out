/**
 * Scheduled Campaign Service
 * 
 * Automatically executes campaigns at their scheduled time
 * Supports one-time and recurring campaigns
 */

import { getDb } from "../db";
import { campaigns } from "../../drizzle/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { addDiscoveryToQueue } from "./inMemoryQueue";

// Check for scheduled campaigns every minute
const CHECK_INTERVAL = 60 * 1000; // 1 minute

let schedulerInterval: NodeJS.Timeout | null = null;

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
      );

    if (scheduledCampaigns.length === 0) {
      return;
    }

    console.log(`[ScheduledCampaigns] Found ${scheduledCampaigns.length} campaigns to execute`);

    for (const campaign of scheduledCampaigns) {
      try {
        await executeCampaign(campaign);
      } catch (error) {
        console.error(`[ScheduledCampaigns] Error executing campaign ${campaign.id}:`, error);
      }
    }
  } catch (error) {
    console.error("[ScheduledCampaigns] Error checking scheduled campaigns:", error);
  }
}

/**
 * Execute a scheduled campaign
 */
async function executeCampaign(campaign: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  console.log(`[ScheduledCampaigns] Executing campaign ${campaign.id}: ${campaign.title}`);

  // Parse target platforms and search criteria
  const targetPlatforms = JSON.parse(campaign.targetPlatforms);
  const searchCriteria = JSON.parse(campaign.searchCriteria);

  // Get platform IDs
  const { getAllPlatforms } = await import("../db");
  const allPlatforms = await getAllPlatforms();
  const platformIds = allPlatforms
    .filter((p: any) => targetPlatforms.includes(p.name))
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
    
    console.log(`[ScheduledCampaigns] Campaign ${campaign.id} will run again at ${nextExecution}`);
  } else {
    // One-time campaign - mark as completed after execution
    updates.nextExecutionAt = null;
    updates.status = "active"; // Will be marked completed after discovery finishes
  }

  await db
    .update(campaigns)
    .set(updates)
    .where(eq(campaigns.id, campaign.id));

  console.log(`[ScheduledCampaigns] Campaign ${campaign.id} executed successfully`);
}

/**
 * Calculate next execution time based on recurring pattern
 */
function calculateNextExecution(pattern: string): Date {
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
export function getOptimalTimeSuggestions(): Array<{ label: string; date: Date }> {
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
