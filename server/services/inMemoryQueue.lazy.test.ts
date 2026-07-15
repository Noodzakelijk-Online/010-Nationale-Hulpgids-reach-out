import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("in-memory queue lazy dependencies", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("./aiMatching");
  });

  it("does not load AI matching when queue helpers are imported", async () => {
    let aiMatchingLoaded = false;
    vi.doMock("./aiMatching", () => {
      aiMatchingLoaded = true;
      return {
        calculateCompatibility: vi.fn(),
        generateOutreachMessage: vi.fn(),
      };
    });

    const queueModule = await import("./inMemoryQueue");

    expect(queueModule.messageQueue).toBeDefined();
    expect(queueModule.discoveryQueue).toBeDefined();
    expect(aiMatchingLoaded).toBe(false);
  });
});
