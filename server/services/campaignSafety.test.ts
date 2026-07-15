import { describe, expect, it } from "vitest";
import {
  countSuccessfulSendsToday,
  getScheduledExecutionDecision,
  parseCampaignSearchCriteria,
} from "./campaignSafety";

describe("campaign safety policy", () => {
  it("adds conservative defaults to campaign search criteria", () => {
    const criteria = parseCampaignSearchCriteria(
      JSON.stringify({ location: "Arnhem", services: "Begeleiding" })
    );

    expect(criteria.safetyPolicy).toEqual({
      dailySendLimit: 5,
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
    });
  });

  it("rejects unsafe daily send limits", () => {
    expect(() =>
      parseCampaignSearchCriteria(
        JSON.stringify({
          location: "Arnhem",
          safetyPolicy: { dailySendLimit: 100 },
        })
      )
    ).toThrow(/between 1 and 20/i);
  });

  it("defers scheduled execution during overnight quiet hours", () => {
    const criteria = parseCampaignSearchCriteria(
      JSON.stringify({
        safetyPolicy: {
          dailySendLimit: 3,
          quietHoursStart: "20:00",
          quietHoursEnd: "08:00",
        },
      })
    );
    const decision = getScheduledExecutionDecision(
      criteria,
      new Date("2026-06-29T22:30:00")
    );

    expect(decision.quietHoursActive).toBe(true);
    expect(decision.nextAllowedExecutionAt.getHours()).toBe(8);
    expect(decision.nextAllowedExecutionAt.getMinutes()).toBe(0);
    expect(decision.nextAllowedExecutionAt.getDate()).toBe(30);
  });

  it("counts only successful sends from the current local day", () => {
    const now = new Date("2026-06-29T15:00:00");

    expect(
      countSuccessfulSendsToday(
        [
          {
            status: "succeeded",
            finishedAt: new Date("2026-06-29T09:00:00"),
            createdAt: new Date("2026-06-29T08:59:00"),
          },
          {
            status: "failed",
            finishedAt: new Date("2026-06-29T10:00:00"),
            createdAt: new Date("2026-06-29T10:00:00"),
          },
          {
            status: "succeeded",
            finishedAt: new Date("2026-06-28T23:59:00"),
            createdAt: new Date("2026-06-28T23:59:00"),
          },
        ],
        now
      )
    ).toBe(1);
  });
});
