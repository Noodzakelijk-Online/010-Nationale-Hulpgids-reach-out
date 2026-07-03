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
import { consumeScraperLimit, consumeMessageLimit } from "./rateLimiter";
import {
  serializeSafeJson,
  truncateOperationalText,
} from "./safeSerialization";
import type { ScrapedCandidate, SearchCriteria } from "./platformScraper";

interface Job {
  id: string;
  name: string;
  data: any;
  opts: JobOptions;
  attempts: number;
  maxAttempts: number;
  status:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "cancelled";
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

type DurableQueueName = "messages" | "discovery";
type DurableQueueStatus =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "cancelled";

class QueueJobCancelledError extends Error {
  constructor() {
    super("Cancelled by user request");
    this.name = "QueueJobCancelledError";
  }
}

class InMemoryQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private waiting: Job[] = [];
  private active: Job[] = [];
  private completed: Job[] = [];
  private failed: Job[] = [];
  private delayed: Job[] = [];
  private cancellationRequests: Set<number> = new Set();
  private abortControllers: Map<number, AbortController> = new Map();
  private processing = false;
  private concurrency: number;
  private rateLimiter?: {
    max: number;
    duration: number;
    tokens: number;
    lastRefill: number;
  };

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

  async add(
    name: string,
    data: any,
    opts: JobOptions = {}
  ): Promise<{ id: string }> {
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
      this.waiting.sort(
        (a, b) => (b.opts.priority || 0) - (a.opts.priority || 0)
      );
    }

    this.emit("added", { jobId: job.id });
    this.processQueue();

    return { id: job.id };
  }

  private moveToWaiting(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "waiting";
    this.delayed = this.delayed.filter(j => j.id !== jobId);
    this.waiting.push(job);
    this.waiting.sort(
      (a, b) => (b.opts.priority || 0) - (a.opts.priority || 0)
    );
    void this.updateDurableJob(job, "waiting");
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
      void this.updateDurableJob(job, "active");

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
      const queueJobRecordId = this.getDurableRecordId(job);
      const abortController =
        this.name === "candidate-discovery" && queueJobRecordId
          ? this.createAbortController(queueJobRecordId)
          : undefined;
      // Call the appropriate worker based on queue name
      let result;
      if (this.name === "outreach-messages") {
        result = await this.processMessageJob(job);
      } else if (this.name === "candidate-discovery") {
        result = await this.processDiscoveryJob(job, abortController?.signal);
      } else {
        throw new Error(`Unknown queue: ${this.name}`);
      }

      // Job completed successfully
      job.status = "completed";
      job.result = result;
      job.progress = 100;
      this.active = this.active.filter(j => j.id !== job.id);
      this.clearCancellationRequest(job);
      this.completed.push(job);

      // Keep only last 100 completed jobs
      if (this.completed.length > 100) {
        const removed = this.completed.shift();
        if (removed) this.jobs.delete(removed.id);
      }

      await this.updateDurableJob(job, "completed", {
        result,
        messageId:
          result && typeof result.messageId === "number"
            ? result.messageId
            : undefined,
      });
      this.emit("completed", { jobId: job.id, returnvalue: result });
    } catch (error: any) {
      // Job failed
      job.error = error.message;

      if (error instanceof QueueJobCancelledError) {
        job.status = "cancelled";
        this.active = this.active.filter(j => j.id !== job.id);
        this.clearCancellationRequest(job);

        await this.updateDurableJob(job, "cancelled", {
          errorMessage: error.message,
        });
        this.emit("cancelled", { jobId: job.id });
        this.clearAbortController(job);
        this.processQueue();
        return;
      }

      if (job.attempts < job.maxAttempts) {
        // Retry with exponential backoff
        const delay = job.opts.backoff
          ? job.opts.backoff.delay * Math.pow(2, job.attempts - 1)
          : 2000;

        job.status = "delayed";
        this.active = this.active.filter(j => j.id !== job.id);
        this.delayed.push(job);

        setTimeout(() => this.moveToWaiting(job.id), delay);
        await this.updateDurableJob(job, "delayed", {
          errorMessage: error.message,
        });
        this.emit("retrying", { jobId: job.id, attempt: job.attempts, delay });
      } else {
        // Max attempts reached
        job.status = "failed";
        this.active = this.active.filter(j => j.id !== job.id);
        this.clearCancellationRequest(job);
        this.failed.push(job);

        // Keep only last 500 failed jobs
        if (this.failed.length > 500) {
          const removed = this.failed.shift();
          if (removed) this.jobs.delete(removed.id);
        }

        await this.updateDurableJob(job, "failed", {
          errorMessage: error.message,
        });
        this.emit("failed", { jobId: job.id, failedReason: error.message });
      }
    }

    // Continue processing queue
    this.clearAbortController(job);
    this.processQueue();
  }

  private async processMessageJob(job: Job): Promise<any> {
    const { candidateId, campaignId, platform, generateMessage, platformId } =
      job.data;

    console.log(
      `[InMemoryQueue] Processing message job ${job.id} for candidate ${candidateId}`
    );

    const { resolvePlatformIdentity } = await import("../db");
    let platformRecord;
    try {
      platformRecord = await resolvePlatformIdentity({
        platformId,
        platformName: platform,
      });
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Message queue platform mismatch"
      );
    }

    if (!platformRecord) {
      throw new Error(
        "Message queue job requires a valid platformId or known platform name"
      );
    }

    // Apply rate limiting for the resolved platform to keep ledger provenance stable.
    await consumeMessageLimit(platformRecord.name, 1);

    // Update progress
    job.progress = 25;
    this.emit("progress", { jobId: job.id, data: 25 });

    // Generate message if requested
    let messageContent = job.data.messageContent;
    if (generateMessage) {
      const { getCandidateById, getCampaignById } = await import("../db");
      const { generateOutreachMessage } = await import("./aiMatching");
      const candidate = await getCandidateById(candidateId);
      const campaign = await getCampaignById(campaignId);

      if (!candidate || !campaign) {
        throw new Error("Candidate or campaign not found");
      }

      const campaignDescription = campaign.description || campaign.title;
      const messageResult = await generateOutreachMessage(
        candidate,
        campaignDescription,
        "nl"
      );
      messageContent = messageResult.content;
    }

    job.progress = 50;
    this.emit("progress", { jobId: job.id, data: 50 });

    // Store message in database
    const { createMessage } = await import("../db");
    const messageId = await createMessage({
      campaignId,
      candidateId,
      platformId: platformRecord.id,
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

  private async processDiscoveryJob(
    job: Job,
    abortSignal?: AbortSignal
  ): Promise<any> {
    const { campaignId, platformId, searchCriteria, userId } = job.data;

    console.log(
      `[InMemoryQueue] Processing discovery job ${job.id} for campaign ${campaignId}`
    );

    const readinessGate = await assertDiscoveryReadiness({
      campaignId,
      userId,
      source: "queue.discovery.worker",
      queueJobId: job.id,
    });
    this.throwIfCancellationRequested(job);
    const campaign = readinessGate.campaign;
    const effectiveUserId = readinessGate.userId;

    // Get platform details
    const { getAllPlatforms } = await import("../db");
    const platforms = await getAllPlatforms();
    const platform = platforms.find((p: any) => p.id === platformId);

    if (!platform) {
      throw new Error(`Platform ${platformId} not found`);
    }

    // Apply rate limiting for the platform
    await consumeScraperLimit(platform.name, 1);
    this.throwIfCancellationRequested(job);

    job.progress = 25;
    this.emit("progress", { jobId: job.id, data: 25 });

    const normalizedSearchCriteria =
      normalizeDiscoverySearchCriteria(searchCriteria);
    const normalizedMatchingCriteria = normalizeDiscoveryMatchingCriteria(
      normalizedSearchCriteria
    );

    const [{ PlatformScraperFactory }, { calculateCompatibility }, database] =
      await Promise.all([
        import("./platformScraper"),
        import("./aiMatching"),
        import("../db"),
      ]);

    let scrapedCandidates: ScrapedCandidate[] = [];
    try {
      const scraper = PlatformScraperFactory.createScraper(platform.name);
      scrapedCandidates = await scraper.searchCandidates(
        normalizedSearchCriteria,
        { signal: abortSignal }
      );
      this.throwIfCancellationRequested(job);
    } catch (error) {
      if (
        error instanceof QueueJobCancelledError ||
        (this.isAbortError(error) && this.isCancellationRequested(job))
      ) {
        throw new QueueJobCancelledError();
      }
      await database.createAuditEvent({
        userId: effectiveUserId,
        campaignId,
        entityType: "campaign",
        entityId: campaignId,
        action: "candidate.discovery_failed",
        actor: "system",
        source: platform.name,
        riskLevel: "medium",
        afterState: JSON.stringify({
          platformId,
          error: error instanceof Error ? error.message : String(error),
        }),
      });
      throw error;
    }

    job.progress = 50;
    this.emit("progress", { jobId: job.id, data: 50 });

    const existingCandidates =
      await database.getUserCandidates(effectiveUserId);
    const savedCandidates = [];
    let duplicateCount = 0;

    for (const scrapedCandidate of scrapedCandidates) {
      this.throwIfCancellationRequested(job);
      const existingCandidate = findExistingCandidate(
        existingCandidates,
        campaignId,
        platformId,
        scrapedCandidate
      );
      if (existingCandidate) {
        duplicateCount++;
        continue;
      }

      const hourlyRate = parseHourlyRateCents(scrapedCandidate.hourlyRate);
      const matchResult = await calculateCompatibility(
        {
          location: scrapedCandidate.location,
          experience: scrapedCandidate.experience,
          services: normalizeServicesForStorage(scrapedCandidate.services),
          hourlyRate,
        },
        normalizedMatchingCriteria
      );

      const candidateId = await database.createCandidate({
        campaignId,
        platformId,
        name: scrapedCandidate.name,
        email: scrapedCandidate.email,
        phone: scrapedCandidate.phone,
        profileUrl: scrapedCandidate.profileUrl,
        location: scrapedCandidate.location,
        experience: scrapedCandidate.experience,
        services: normalizeServicesForStorage(scrapedCandidate.services),
        availability: scrapedCandidate.availability,
        hourlyRate,
        bio: scrapedCandidate.bio,
        profileData: JSON.stringify({
          source: "queue.discovery",
          platform: platform.name,
          discoveredAt: new Date().toISOString(),
          profileUrl: scrapedCandidate.profileUrl,
        }),
        compatibilityScore: matchResult.compatibilityScore,
        matchReasons: JSON.stringify(matchResult.matchReasons || []),
        status: matchResult.compatibilityScore >= 60 ? "matched" : "discovered",
      });

      const storedCandidate = await database.getCandidateById(candidateId);
      if (storedCandidate) {
        await database.getOrCreateCandidateIdentity(
          storedCandidate,
          effectiveUserId
        );
      }

      savedCandidates.push({
        ...scrapedCandidate,
        id: candidateId,
        compatibilityScore: matchResult.compatibilityScore,
      });
    }
    this.throwIfCancellationRequested(job);

    job.progress = 75;
    this.emit("progress", { jobId: job.id, data: 75 });

    await database.createAuditEvent({
      userId: effectiveUserId,
      campaignId,
      entityType: "campaign",
      entityId: campaignId,
      action: "candidate.discovery_completed",
      actor: "system",
      source: platform.name,
      riskLevel: "low",
      afterState: JSON.stringify({
        platformId,
        scrapedCount: scrapedCandidates.length,
        savedCount: savedCandidates.length,
        duplicateCount,
      }),
    });

    const savedCount = savedCandidates.length;
    this.throwIfCancellationRequested(job);

    job.progress = 100;
    this.emit("progress", { jobId: job.id, data: 100 });

    return {
      success: true,
      candidatesFound: savedCount,
      candidatesSkippedAsDuplicates: duplicateCount,
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

  async cancelJobByDurableRecordId(
    durableJobRecordId: number
  ): Promise<{
    cancelled: boolean;
    cancellationRequested?: boolean;
    reason?: "not_found" | "not_cancellable";
    status?: Job["status"];
    jobId?: string;
  }> {
    const job = Array.from(this.jobs.values()).find(
      entry => Number(entry.data?.queueJobRecordId) === durableJobRecordId
    );

    if (!job) return { cancelled: false, reason: "not_found" };
    if (job.status === "active" && this.name === "candidate-discovery") {
      this.cancellationRequests.add(durableJobRecordId);
      this.abortControllers.get(durableJobRecordId)?.abort();
      await this.updateDurableJob(job, "active", {
        errorMessage: "Cancellation requested by user",
      });
      this.emit("cancel_requested", { jobId: job.id });
      return {
        cancelled: false,
        cancellationRequested: true,
        status: job.status,
        jobId: job.id,
      };
    }
    if (job.status !== "waiting" && job.status !== "delayed") {
      return {
        cancelled: false,
        reason: "not_cancellable",
        status: job.status,
        jobId: job.id,
      };
    }

    this.waiting = this.waiting.filter(entry => entry.id !== job.id);
    this.delayed = this.delayed.filter(entry => entry.id !== job.id);
    job.status = "cancelled";
    this.jobs.delete(job.id);

    await this.updateDurableJob(job, "cancelled", {
      errorMessage: "Cancelled by user",
    });
    this.emit("cancelled", { jobId: job.id });

    return { cancelled: true, status: "cancelled", jobId: job.id };
  }

  private getDurableRecordId(job: Job) {
    const queueJobRecordId = Number(job.data?.queueJobRecordId);
    return Number.isFinite(queueJobRecordId) && queueJobRecordId > 0
      ? queueJobRecordId
      : undefined;
  }

  private clearCancellationRequest(job: Job) {
    const queueJobRecordId = this.getDurableRecordId(job);
    if (queueJobRecordId) this.cancellationRequests.delete(queueJobRecordId);
  }

  private createAbortController(queueJobRecordId: number) {
    const abortController = new AbortController();
    if (this.cancellationRequests.has(queueJobRecordId)) {
      abortController.abort();
    }
    this.abortControllers.set(queueJobRecordId, abortController);
    return abortController;
  }

  private clearAbortController(job: Job) {
    const queueJobRecordId = this.getDurableRecordId(job);
    if (queueJobRecordId) this.abortControllers.delete(queueJobRecordId);
  }

  private isCancellationRequested(job: Job) {
    const queueJobRecordId = this.getDurableRecordId(job);
    return Boolean(
      queueJobRecordId && this.cancellationRequests.has(queueJobRecordId)
    );
  }

  private isAbortError(error: unknown) {
    return (
      error instanceof DOMException && error.name === "AbortError"
    );
  }

  private throwIfCancellationRequested(job: Job) {
    if (this.isCancellationRequested(job)) {
      throw new QueueJobCancelledError();
    }
  }

  async getJobs(
    status?:
      | "waiting"
      | "active"
      | "completed"
      | "failed"
      | "delayed"
      | "cancelled",
    start = 0,
    end = -1
  ): Promise<Job[]> {
    let jobs: Job[] = [];

    if (status) {
      switch (status) {
        case "waiting":
          jobs = [...this.waiting];
          break;
        case "active":
          jobs = [...this.active];
          break;
        case "completed":
          jobs = [...this.completed];
          break;
        case "failed":
          jobs = [...this.failed];
          break;
        case "delayed":
          jobs = [...this.delayed];
          break;
        case "cancelled":
          jobs = [];
          break;
      }
    } else {
      // Return all jobs sorted by creation time (newest first)
      jobs = [
        ...this.active,
        ...this.waiting,
        ...this.delayed,
        ...this.completed,
        ...this.failed,
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    // Apply pagination
    if (end === -1) {
      return jobs.slice(start);
    }
    return jobs.slice(start, end + 1);
  }

  async close(): Promise<void> {
    this.removeAllListeners();
    console.log(`[InMemoryQueue] Queue ${this.name} closed`);
  }

  private async updateDurableJob(
    job: Job,
    status: DurableQueueStatus,
    options: {
      errorMessage?: string;
      result?: unknown;
      messageId?: number;
    } = {}
  ) {
    const queueJobRecordId = Number(job.data?.queueJobRecordId);
    if (!Number.isFinite(queueJobRecordId) || queueJobRecordId <= 0) return;

    try {
      const database = await import("../db");
      await database.updateQueueJobRecord(queueJobRecordId, {
        status,
        errorMessage: truncateOperationalText(options.errorMessage) ?? null,
        messageId: options.messageId,
        payloadJson: serializeSafeJson(
          serializeDurableQueuePayload(
            toDurableQueueName(this.name),
            job.data,
            job.id,
            options.result
          )
        ),
      });
    } catch (error) {
      console.warn("[Queue] Failed to update durable queue job:", error);
    }
  }
}

function normalizeDiscoverySearchCriteria(value: any): SearchCriteria {
  return {
    location:
      typeof value?.location === "string" && value.location.trim()
        ? value.location.trim()
        : undefined,
    experience:
      typeof value?.experience === "string"
        ? value.experience.trim()
        : undefined,
    services: splitList(value?.services).join(", "),
    minBudget:
      typeof value?.minBudget === "string" ? value.minBudget.trim() : undefined,
    maxBudget:
      typeof value?.maxBudget === "string" ? value.maxBudget.trim() : undefined,
    keywords:
      typeof value?.keywords === "string" ? value.keywords.trim() : undefined,
  };
}

function normalizeDiscoveryMatchingCriteria(criteria: SearchCriteria) {
  return {
    location: criteria.location || "",
    services: splitList(criteria.services),
    experience: criteria.experience,
    budget: {
      min: parseHourlyRateCents(criteria.minBudget) ?? undefined,
      max: parseHourlyRateCents(criteria.maxBudget) ?? undefined,
    },
  };
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map(entry => entry.trim())
    .filter(Boolean);
}

function normalizeServicesForStorage(value: unknown): string | undefined {
  const services = splitList(value);
  return services.length > 0 ? services.join(", ") : undefined;
}

function parseHourlyRateCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(Number(match[1]) * 100);
}

function findExistingCandidate(
  existingCandidates: any[],
  campaignId: number,
  platformId: number,
  scrapedCandidate: ScrapedCandidate
) {
  const profileUrl = scrapedCandidate.profileUrl?.trim().toLowerCase();
  const email = scrapedCandidate.email?.trim().toLowerCase();
  return existingCandidates.find(candidate => {
    if (
      candidate.campaignId !== campaignId ||
      candidate.platformId !== platformId
    )
      return false;
    const candidateProfileUrl = candidate.profileUrl?.trim().toLowerCase();
    const candidateEmail = candidate.email?.trim().toLowerCase();
    return (
      (profileUrl && candidateProfileUrl === profileUrl) ||
      (email && candidateEmail === email)
    );
  });
}

// Create queue instances
export const messageQueue = new InMemoryQueue("outreach-messages", {
  concurrency: Number(process.env.MESSAGE_QUEUE_CONCURRENCY || 2),
  rateLimiter: { max: 50, duration: 60000 }, // 50 per minute
});

export const discoveryQueue = new InMemoryQueue("candidate-discovery", {
  concurrency: Number(process.env.DISCOVERY_QUEUE_CONCURRENCY || 1),
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
  userId?: number;
  messageContent?: string;
  subject?: string;
  generateMessage?: boolean;
  priority?: number;
  delay?: number;
}): Promise<string> {
  const queueJobRecordId = await recordDurableQueueJob({
    userId: data.userId,
    campaignId: data.campaignId,
    queueName: "messages",
    jobType: "send-message",
    status: data.delay ? "delayed" : "waiting",
    payload: serializeDurableQueuePayload("messages", data),
  });
  const jobData = queueJobRecordId ? { ...data, queueJobRecordId } : data;
  const job = await messageQueue.add("send-message", jobData, {
    priority: data.priority || 1,
    delay: data.delay || 0,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });

  if (queueJobRecordId) {
    await updateDurableQueuePayload(
      queueJobRecordId,
      serializeDurableQueuePayload("messages", jobData, job.id)
    );
  }

  return job.id;
}

export async function addDiscoveryToQueue(data: {
  campaignId: number;
  platformId: number;
  searchCriteria: any;
  userId?: number;
  priority?: number;
}): Promise<string> {
  await assertDiscoveryReadiness({
    campaignId: data.campaignId,
    userId: data.userId,
    source: "queue.discovery.enqueue",
    payload: data,
  });

  const queueJobRecordId = await recordDurableQueueJob({
    userId: data.userId,
    campaignId: data.campaignId,
    queueName: "discovery",
    jobType: "discover-candidates",
    status: "waiting",
    payload: serializeDurableQueuePayload("discovery", data),
  });
  const jobData = queueJobRecordId ? { ...data, queueJobRecordId } : data;
  const job = await discoveryQueue.add("discover-candidates", jobData, {
    priority: data.priority || 1,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  });

  if (queueJobRecordId) {
    await updateDurableQueuePayload(
      queueJobRecordId,
      serializeDurableQueuePayload("discovery", jobData, job.id)
    );
  }

  return job.id;
}

async function recordDurableQueueJob(input: {
  userId?: number;
  campaignId: number;
  queueName: DurableQueueName;
  jobType: string;
  status: "waiting" | "delayed" | "failed";
  payload: unknown;
  errorMessage?: string;
}): Promise<number | undefined> {
  try {
    const database = await import("../db");
    const campaign = await database.getCampaignById(input.campaignId);
    const userId = input.userId ?? campaign?.userId;
    if (!userId) return undefined;

    return await database.createQueueJobRecord({
      userId,
      campaignId: input.campaignId,
      queueName: input.queueName,
      jobType: input.jobType,
      status: input.status,
      payloadJson: serializeSafeJson(input.payload),
      errorMessage: truncateOperationalText(input.errorMessage),
    });
  } catch (error) {
    console.warn("[Queue] Failed to record durable queue job:", error);
    return undefined;
  }
}

async function updateDurableQueuePayload(
  queueJobRecordId: number,
  payload: unknown
) {
  try {
    const database = await import("../db");
    await database.updateQueueJobRecord(queueJobRecordId, {
      payloadJson: serializeSafeJson(payload),
    });
  } catch (error) {
    console.warn("[Queue] Failed to update durable queue payload:", error);
  }
}

function toDurableQueueName(queueName: string): DurableQueueName {
  return queueName === "outreach-messages" ? "messages" : "discovery";
}

function serializeDurableQueuePayload(
  queueName: DurableQueueName,
  data: any,
  queueJobId?: string,
  result?: unknown
) {
  const base = {
    campaignId: data?.campaignId,
    userId: data?.userId,
    priority: data?.priority,
    queueJobId,
    queueJobRecordId: data?.queueJobRecordId,
  };

  if (queueName === "messages") {
    return {
      ...base,
      candidateId: data?.candidateId,
      platform: data?.platform,
      platformId: data?.platformId,
      subject: data?.subject,
      generateMessage: data?.generateMessage,
      delay: data?.delay,
      messageContent: data?.messageContent ? "[redacted]" : undefined,
      result: result ? summarizeQueueResult(result) : undefined,
    };
  }

  return {
    ...base,
    platformId: data?.platformId,
    searchCriteria: data?.searchCriteria,
    result: result ? summarizeQueueResult(result) : undefined,
  };
}

function summarizeQueueResult(result: unknown) {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  return {
    success: record.success,
    messageId: record.messageId,
    candidateId: record.candidateId,
    candidatesFound: record.candidatesFound,
    candidatesSkippedAsDuplicates: record.candidatesSkippedAsDuplicates,
    platform: record.platform,
    timestamp: record.timestamp,
  };
}

async function assertDiscoveryReadiness(input: {
  campaignId: number;
  userId?: number;
  source: string;
  queueJobId?: string;
  payload?: unknown;
}) {
  const [database, ledger] = await Promise.all([
    import("../db"),
    import("./outreachLedger"),
  ]);
  const campaign = await database.getCampaignById(input.campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${input.campaignId} not found`);
  }

  const userId = input.userId ?? campaign.userId;
  const readiness = await ledger.recordReadinessSnapshot(campaign, userId);
  if (readiness.status !== "blocked") {
    return { campaign, readiness, userId };
  }

  const errorMessage = `Campaign discovery is blocked by readiness checks: ${readiness.blockers.join("; ")}`;
  await database.createAuditEvent({
    userId,
    campaignId: campaign.id,
    entityType: "campaign",
    entityId: campaign.id,
    action: "campaign.discovery_blocked_readiness",
    actor: "system",
    source: input.source,
    riskLevel: "medium",
    afterState: JSON.stringify({
      blockers: readiness.blockers,
      status: readiness.status,
      queueJobId: input.queueJobId,
    }),
  });

  if (input.payload) {
    await recordDurableQueueJob({
      userId,
      campaignId: campaign.id,
      queueName: "discovery",
      jobType: "discover-candidates",
      status: "failed",
      payload: input.payload,
      errorMessage,
    });
  }

  throw new Error(errorMessage);
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
