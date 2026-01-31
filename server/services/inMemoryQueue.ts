/**
 * In-Memory Queue Implementation
 * 
 * Provides a simple queue system without Redis dependency
 * Compatible with BullMQ API for easy migration
 * 
 * Features:
 * - Job queuing with priorities
 * - Retry logic with exponential backoff
 * - Rate limiting per queue
 * - Event emitters for job lifecycle
 * - Concurrent processing
 */

import { EventEmitter } from "events";
import { generateOutreachMessage } from "./aiMatching";
import { consumeScraperLimit, consumeMessageLimit } from "./rateLimiter";

interface Job {
  id: string;
  name: string;
  data: any;
  opts: JobOptions;
  attempts: number;
  maxAttempts: number;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

interface JobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: { type: "exponential"; delay: number };
}

class InMemoryQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private waiting: Job[] = [];
  private active: Job[] = [];
  private completed: Job[] = [];
  private failed: Job[] = [];
  private delayed: Job[] = [];
  private processing = false;
  private concurrency: number;
  private rateLimiter?: { max: number; duration: number; tokens: number; lastRefill: number };

  constructor(
    public name: string,
    options: {
      concurrency?: number;
      rateLimiter?: { max: number; duration: number };
    } = {}
  ) {
    super();
    this.concurrency = options.concurrency || 5;
    
    if (options.rateLimiter) {
      this.rateLimiter = {
        ...options.rateLimiter,
        tokens: options.rateLimiter.max,
        lastRefill: Date.now(),
      };
    }
  }

  async add(name: string, data: any, opts: JobOptions = {}): Promise<{ id: string }> {
    const job: Job = {
      id: `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      data,
      opts,
      attempts: 0,
      maxAttempts: opts.attempts || 3,
      status: opts.delay ? "delayed" : "waiting",
      progress: 0,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);

    if (opts.delay) {
      this.delayed.push(job);
      setTimeout(() => this.moveToWaiting(job.id), opts.delay);
    } else {
      this.waiting.push(job);
      this.waiting.sort((a, b) => (b.opts.priority || 0) - (a.opts.priority || 0));
    }

    this.emit("added", { jobId: job.id });
    this.processQueue();

    return { id: job.id };
  }

  private moveToWaiting(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "waiting";
    this.delayed = this.delayed.filter((j) => j.id !== jobId);
    this.waiting.push(job);
    this.waiting.sort((a, b) => (b.opts.priority || 0) - (a.opts.priority || 0));
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.waiting.length > 0 && this.active.length < this.concurrency) {
      // Check rate limiter
      if (this.rateLimiter) {
        this.refillTokens();
        if (this.rateLimiter.tokens <= 0) {
          // Wait for token refill
          setTimeout(() => this.processQueue(), 1000);
          break;
        }
        this.rateLimiter.tokens--;
      }

      const job = this.waiting.shift();
      if (!job) break;

      job.status = "active";
      job.attempts++;
      job.processedAt = new Date();
      this.active.push(job);

      this.emit("active", { jobId: job.id });

      // Process job asynchronously
      this.processJob(job);
    }

    this.processing = false;
  }

  private refillTokens() {
    if (!this.rateLimiter) return;

    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    if (elapsed >= this.rateLimiter.duration) {
      this.rateLimiter.tokens = this.rateLimiter.max;
      this.rateLimiter.lastRefill = now;
    }
  }

  private async processJob(job: Job) {
    try {
      // Call the appropriate worker based on queue name
      let result;
      if (this.name === "outreach-messages") {
        result = await this.processMessageJob(job);
      } else if (this.name === "candidate-discovery") {
        result = await this.processDiscoveryJob(job);
      } else {
        throw new Error(`Unknown queue: ${this.name}`);
      }

      // Job completed successfully
      job.status = "completed";
      job.result = result;
      job.progress = 100;
      this.active = this.active.filter((j) => j.id !== job.id);
      this.completed.push(job);

      // Keep only last 100 completed jobs
      if (this.completed.length > 100) {
        const removed = this.completed.shift();
        if (removed) this.jobs.delete(removed.id);
      }

      this.emit("completed", { jobId: job.id, returnvalue: result });
    } catch (error: any) {
      // Job failed
      job.error = error.message;

      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delay = job.opts.backoff
          ? job.opts.backoff.delay * Math.pow(2, job.attempts - 1)
          : 2000;

        job.status = "delayed";
        this.active = this.active.filter((j) => j.id !== job.id);
        this.delayed.push(job);

        setTimeout(() => this.moveToWaiting(job.id), delay);
        this.emit("retrying", { jobId: job.id, attempt: job.attempts, delay });
      } else {
        // Max attempts reached
        job.status = "failed";
        this.active = this.active.filter((j) => j.id !== job.id);
        this.failed.push(job);

        // Keep only last 500 failed jobs
        if (this.failed.length > 500) {
          const removed = this.failed.shift();
          if (removed) this.jobs.delete(removed.id);
        }

        this.emit("failed", { jobId: job.id, failedReason: error.message });
      }
    }

    // Continue processing queue
    this.processQueue();
  }

  private async processMessageJob(job: Job): Promise<any> {
    const { candidateId, campaignId, platform, generateMessage, platformId } = job.data;

    console.log(`[InMemoryQueue] Processing message job ${job.id} for candidate ${candidateId}`);

    // Apply rate limiting for the platform
    if (platform) {
      await consumeMessageLimit(platform, 1);
    }

    // Update progress
    job.progress = 25;
    this.emit("progress", { jobId: job.id, data: 25 });

    // Generate message if requested
    let messageContent = job.data.messageContent;
    if (generateMessage) {
      const { getDb, getCandidateById, getCampaignById } = await import("../db");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const candidate = await getCandidateById(candidateId);
      const campaign = await getCampaignById(campaignId);

      if (!candidate || !campaign) {
        throw new Error("Candidate or campaign not found");
      }

      const campaignDescription = campaign.description || campaign.title;
      const messageResult = await generateOutreachMessage(candidate, campaignDescription, "nl");
      messageContent = messageResult.content;
    }

    job.progress = 50;
    this.emit("progress", { jobId: job.id, data: 50 });

    // Store message in database
    const { createMessage } = await import("../db");
    const messageId = await createMessage({
      campaignId,
      candidateId,
      platformId: platformId || 1,
      subject: `Opportunity: ${job.data.subject || "Care Professional Position"}`,
      content: messageContent,
      status: "queued",
    });

    job.progress = 100;
    this.emit("progress", { jobId: job.id, data: 100 });

    return {
      success: true,
      messageId,
      candidateId,
      timestamp: Date.now(),
    };
  }

  private async processDiscoveryJob(job: Job): Promise<any> {
    const { campaignId, platformId, searchCriteria, userId } = job.data;

    console.log(`[InMemoryQueue] Processing discovery job ${job.id} for campaign ${campaignId}`);

    // Get platform details
    const { getAllPlatforms } = await import("../db");
    const platforms = await getAllPlatforms();
    const platform = platforms.find((p: any) => p.id === platformId);

    if (!platform) {
      throw new Error(`Platform ${platformId} not found`);
    }

    // Apply rate limiting for the platform
    await consumeScraperLimit(platform.name, 1);

    job.progress = 25;
    this.emit("progress", { jobId: job.id, data: 25 });

    // Use platform scraper (mock for now)
    const mockCandidates = [
      {
        name: `Mock Candidate from ${platform.name}`,
        email: "mock@example.com",
        platform: platform.name,
        location: searchCriteria.location || "Unknown",
        experience: "5 years",
        services: searchCriteria.services || [],
        availability: "Full-time",
        compatibilityScore: 75,
      },
    ];

    job.progress = 75;
    this.emit("progress", { jobId: job.id, data: 75 });

    const savedCount = mockCandidates.length;

    job.progress = 100;
    this.emit("progress", { jobId: job.id, data: 100 });

    return {
      success: true,
      candidatesFound: savedCount,
      platform: platform.name,
      timestamp: Date.now(),
    };
  }

  async getWaitingCount(): Promise<number> {
    return this.waiting.length;
  }

  async getActiveCount(): Promise<number> {
    return this.active.length;
  }

  async getCompletedCount(): Promise<number> {
    return this.completed.length;
  }

  async getFailedCount(): Promise<number> {
    return this.failed.length;
  }

  async getDelayedCount(): Promise<number> {
    return this.delayed.length;
  }

  async close(): Promise<void> {
    this.removeAllListeners();
    console.log(`[InMemoryQueue] Queue ${this.name} closed`);
  }
}

// Create queue instances
export const messageQueue = new InMemoryQueue("outreach-messages", {
  concurrency: 5,
  rateLimiter: { max: 50, duration: 60000 }, // 50 per minute
});

export const discoveryQueue = new InMemoryQueue("candidate-discovery", {
  concurrency: 3,
});

// Event listeners
messageQueue.on("completed", ({ jobId, returnvalue }) => {
  console.log(`[MessageQueue] Job ${jobId} completed:`, returnvalue);
});

messageQueue.on("failed", ({ jobId, failedReason }) => {
  console.error(`[MessageQueue] Job ${jobId} failed:`, failedReason);
});

discoveryQueue.on("completed", ({ jobId, returnvalue }) => {
  console.log(`[DiscoveryQueue] Job ${jobId} completed:`, returnvalue);
});

discoveryQueue.on("failed", ({ jobId, failedReason }) => {
  console.error(`[DiscoveryQueue] Job ${jobId} failed:`, failedReason);
});

// Helper functions
export async function addMessageToQueue(data: {
  candidateId: number;
  campaignId: number;
  platform: string;
  platformId?: number;
  messageContent?: string;
  subject?: string;
  generateMessage?: boolean;
  priority?: number;
  delay?: number;
}): Promise<string> {
  const job = await messageQueue.add("send-message", data, {
    priority: data.priority || 1,
    delay: data.delay || 0,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  return job.id;
}

export async function addDiscoveryToQueue(data: {
  campaignId: number;
  platformId: number;
  searchCriteria: any;
  userId?: number;
  priority?: number;
}): Promise<string> {
  const job = await discoveryQueue.add("discover-candidates", data, {
    priority: data.priority || 1,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  });

  return job.id;
}

// Get queue statistics
export async function getQueueStats(queueName: "messages" | "discovery") {
  const queue = queueName === "messages" ? messageQueue : discoveryQueue;

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
  };
}

// Graceful shutdown
export async function closeQueues() {
  await messageQueue.close();
  await discoveryQueue.close();
}

// Handle process termination
process.on("SIGTERM", async () => {
  console.log("[Queue] Received SIGTERM, closing queues...");
  await closeQueues();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Queue] Received SIGINT, closing queues...");
  await closeQueues();
  process.exit(0);
});
