import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock context with admin user
const mockAdminContext: TrpcContext = {
  user: {
    id: 1,
    openId: "test-admin-openid",
    name: "Test Admin",
    email: "admin@test.com",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    loginMethod: null,
  },
};

describe("Message Management Features", () => {
  let testCampaignId: number;
  let testCandidateId: number;
  let testMessageId: number;

  beforeAll(async () => {
    // Create a test campaign
    const campaignResult = await appRouter
      .createCaller(mockAdminContext)
      .campaigns.create({
        title: "Test Campaign for Messages",
        description: "Testing message management",
        targetPlatforms: JSON.stringify([1]),
        searchCriteria: JSON.stringify({ location: "Test City" }),
      });
    testCampaignId = campaignResult.id;

    // Note: In a real scenario, we would create a test candidate here
    // For now, we'll test the procedures that don't require existing candidates
  });

  it("should list all messages with filters", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Test listing all messages
    const allMessages = await caller.messages.listAll({
      status: undefined,
      campaignId: undefined,
    });
    
    expect(Array.isArray(allMessages)).toBe(true);
  });

  it("should filter messages by status", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Test filtering by queued status
    const queuedMessages = await caller.messages.listAll({
      status: "queued",
      campaignId: undefined,
    });
    
    expect(Array.isArray(queuedMessages)).toBe(true);
    // All returned messages should have queued status
    queuedMessages.forEach((msg: any) => {
      if (msg.status) {
        expect(msg.status).toBe("queued");
      }
    });
  });

  it("should filter messages by campaign", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Test filtering by campaign
    const campaignMessages = await caller.messages.listAll({
      status: undefined,
      campaignId: testCampaignId,
    });
    
    expect(Array.isArray(campaignMessages)).toBe(true);
    // All returned messages should belong to the test campaign
    campaignMessages.forEach((msg: any) => {
      if (msg.campaignId) {
        expect(msg.campaignId).toBe(testCampaignId);
      }
    });
  });

  it("should get engagement metrics for a campaign", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    const metrics = await caller.campaigns.getEngagementMetrics({
      campaignId: testCampaignId,
    });
    
    expect(metrics).toBeDefined();
    expect(typeof metrics.totalSent).toBe("number");
    expect(typeof metrics.totalReplied).toBe("number");
    expect(typeof metrics.totalPending).toBe("number");
    expect(typeof metrics.responseRate).toBe("number");
    expect(["up", "down", "stable"]).toContain(metrics.trend);
    
    // Response rate should be between 0 and 100
    expect(metrics.responseRate).toBeGreaterThanOrEqual(0);
    expect(metrics.responseRate).toBeLessThanOrEqual(100);
  });

  it("should calculate correct response rate", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    const metrics = await caller.campaigns.getEngagementMetrics({
      campaignId: testCampaignId,
    });
    
    // If there are sent messages, verify the math
    if (metrics.totalSent > 0) {
      const expectedRate = (metrics.totalReplied / metrics.totalSent) * 100;
      expect(metrics.responseRate).toBeCloseTo(expectedRate, 2);
    } else {
      expect(metrics.responseRate).toBe(0);
    }
  });
});

describe("Platform Credentials Testing", () => {
  it.skip("should test connection with invalid credentials", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Test with obviously invalid credentials
    const result = await caller.platformCredentials.testConnection({
      platformId: 2, // Nationale Hulpgids
      email: "invalid@test.com",
      password: "wrongpassword",
    });
    
    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    expect(typeof result.message).toBe("string");
    
    // Invalid credentials should fail
    expect(result.success).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  }, 10000); // Increase timeout to 10 seconds for network operations

  it("should return not implemented for unsupported platforms", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Test with a platform that doesn't have testing implemented
    const result = await caller.platformCredentials.testConnection({
      platformId: 1, // Indeed (not implemented)
      email: "test@test.com",
      password: "testpass",
    });
    
    expect(result).toBeDefined();
    expect(result.success).toBe(false);
    expect(result.message).toContain("not yet implemented");
  });
});

describe("Bulk Message Operations", () => {
  it("should handle bulk status updates", async () => {
    const caller = appRouter.createCaller(mockAdminContext);
    
    // Get some messages to update
    const messages = await caller.messages.listAll({
      status: "queued",
      campaignId: undefined,
    });
    
    if (messages.length > 0) {
      const messageIds = messages.slice(0, Math.min(3, messages.length)).map((m: any) => m.id);
      
      const result = await caller.messages.bulkUpdateStatus({
        messageIds,
        status: "approved",
      });
      
      expect(result.success).toBe(true);
      expect(result.updated).toBe(messageIds.length);
    }
  });
});
