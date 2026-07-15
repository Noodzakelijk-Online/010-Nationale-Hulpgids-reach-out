import { describe, expect, it } from "vitest";
import { getNextActionRoute } from "@/lib/nextActionRoutes";

describe("next action routes", () => {
  it("routes review work to the exact operating queue", () => {
    expect(
      getNextActionRoute(
        {
          label: "Review messages",
          detail: "3 queued messages need approval or rejection",
        },
        7
      )
    ).toEqual({
      href: "/messages?status=queued&campaignId=7",
      cta: "Open review queue",
    });

    expect(
      getNextActionRoute(
        {
          label: "Review candidate qualification",
          detail: "2 candidates need a current qualification decision",
        },
        7
      )
    ).toEqual({
      href: "/candidates?qualification=needs_qualification",
      cta: "Open candidate triage",
    });

    expect(
      getNextActionRoute(
        {
          label: "Classify responses",
          detail: "1 response needs review",
        },
        7
      )
    ).toEqual({
      href: "/responses?classification=unknown&campaignId=7",
      cta: "Open response inbox",
    });
  });

  it("routes duplicate and send-failure work with focused filters", () => {
    expect(
      getNextActionRoute(
        {
          label: "Review send failures",
          detail: "2 send attempts failed or were blocked",
        },
        7
      )
    ).toEqual({
      href: "/messages?status=failed&campaignId=7",
      cta: "Review send evidence",
    });

    expect(
      getNextActionRoute({
        label: "Review duplicates",
        detail: "3 candidate duplicate pairs need review",
      })
    ).toEqual({
      href: "/candidates?duplicates=needs_duplicate_review",
      cta: "Open duplicate review",
    });
  });

  it("routes delivery evidence integrity work to the campaign ledger", () => {
    expect(
      getNextActionRoute(
        {
          label: "Review delivery evidence",
          detail:
            "1 successful send attempt lacks deterministic delivery evidence",
        },
        7
      )
    ).toEqual({
      href: "/campaigns/7",
      cta: "Open send-attempt ledger",
    });

    expect(
      getNextActionRoute(
        {
          label: "Resolve started send attempts",
          detail: "2 send attempts have been open for more than 30 minutes",
        },
        7
      )
    ).toEqual({
      href: "/campaigns/7",
      cta: "Open send-attempt ledger",
    });
  });

  it("falls back to the campaign ledger for campaign-specific blockers", () => {
    expect(
      getNextActionRoute(
        {
          label: "Fix blocker",
          detail: "Search criteria need a location or service",
        },
        7
      )
    ).toEqual({ href: "/campaigns/7", cta: "Open campaign ledger" });
  });
});
