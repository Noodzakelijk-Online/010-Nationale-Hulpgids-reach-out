export type LedgerNextAction = {
  label?: string;
  detail?: string;
  priority?: string;
};

export function getNextActionRoute(
  action: LedgerNextAction,
  campaignId?: number
) {
  const label = (action.label || "").toLowerCase();
  const detail = (action.detail || "").toLowerCase();
  const fallbackCampaignRoute =
    typeof campaignId === "number" && Number.isFinite(campaignId)
      ? `/campaigns/${campaignId}`
      : "/campaigns";
  const campaignQuery =
    typeof campaignId === "number" && Number.isFinite(campaignId)
      ? `&campaignId=${campaignId}`
      : "";

  if (label.includes("duplicate") || detail.includes("duplicate")) {
    return {
      href: "/candidates?duplicates=needs_duplicate_review",
      cta: "Open duplicate review",
    };
  }

  if (label.includes("message") || detail.includes("queued message")) {
    return {
      href: `/messages?status=queued${campaignQuery}`,
      cta: "Open review queue",
    };
  }

  if (label.includes("qualification") || detail.includes("qualification")) {
    return {
      href: "/candidates?qualification=needs_qualification",
      cta: "Open candidate triage",
    };
  }

  if (
    label.includes("delivery evidence") ||
    label.includes("started send") ||
    detail.includes("lack deterministic delivery evidence") ||
    detail.includes("open for more than")
  ) {
    return {
      href: fallbackCampaignRoute,
      cta: "Open send-attempt ledger",
    };
  }

  if (
    label.includes("send failure") ||
    detail.includes("send attempt") ||
    detail.includes("failed or were blocked")
  ) {
    return {
      href: `/messages?status=failed${campaignQuery}`,
      cta: "Review send evidence",
    };
  }

  if (label.includes("response") || detail.includes("response")) {
    return {
      href: `/responses?classification=unknown${campaignQuery}`,
      cta: "Open response inbox",
    };
  }

  if (label.includes("follow-up") || detail.includes("follow-up")) {
    return { href: "/follow-ups", cta: "Open follow-up queue" };
  }

  if (
    label.includes("credential") ||
    detail.includes("credential") ||
    detail.includes("reconnect") ||
    detail.includes("platform access")
  ) {
    return { href: "/platforms", cta: "Review platform access" };
  }

  if (label.includes("pause sending") || detail.includes("rate-limit")) {
    return { href: fallbackCampaignRoute, cta: "Review readiness" };
  }

  if (label.includes("no immediate blockers")) {
    return { href: fallbackCampaignRoute, cta: "Open ledger" };
  }

  return { href: fallbackCampaignRoute, cta: "Open campaign ledger" };
}
