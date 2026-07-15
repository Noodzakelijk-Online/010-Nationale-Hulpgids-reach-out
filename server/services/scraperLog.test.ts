import { describe, expect, it } from "vitest";
import {
  describeScraperSearchCriteria,
  describeScraperTarget,
} from "./scraperLog";

describe("scraper log target description", () => {
  it("keeps host-level context without exposing profile path or query values", () => {
    const target = describeScraperTarget(
      "https://www.nationalehulpgids.nl/profiel/jane-doe?token=secret&email=jane@example.nl"
    );

    expect(target).toMatch(/^host=www\.nationalehulpgids\.nl urlHash=[a-f0-9]{12}$/);
    expect(target).not.toContain("jane-doe");
    expect(target).not.toContain("token");
    expect(target).not.toContain("jane@example.nl");
  });

  it("returns a stable hash for the same target", () => {
    const url = "https://example.test/private/profile/123";

    expect(describeScraperTarget(url)).toBe(describeScraperTarget(url));
  });

  it("does not echo invalid raw URLs", () => {
    const target = describeScraperTarget("candidate jane@example.nl profile 123");

    expect(target).toMatch(/^invalid-url urlHash=[a-f0-9]{12}$/);
    expect(target).not.toContain("jane@example.nl");
  });

  it("handles empty targets explicitly", () => {
    expect(describeScraperTarget("   ")).toBe("empty-url");
  });

  it("summarizes search criteria without exposing care terms or locations", () => {
    const summary = describeScraperSearchCriteria({
      location: "Amsterdam Centrum",
      services: ["avondzorg", "autisme begeleiding"],
      experience: "senior",
      keywords: "persoonlijke zorg",
      maxDistance: 25,
      minRating: 4,
      minBudget: "20",
      maxBudget: "35",
    });

    expect(summary).toBe(
      "location=present services=2 experience=present keywords=present maxDistance=25 minRating=4 budget=present"
    );
    expect(summary).not.toContain("Amsterdam");
    expect(summary).not.toContain("avondzorg");
    expect(summary).not.toContain("persoonlijke");
  });
});
