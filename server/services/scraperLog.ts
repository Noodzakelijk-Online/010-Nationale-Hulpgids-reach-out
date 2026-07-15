import { createHash } from "crypto";

function shortHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function describeScraperTarget(rawUrl: string): string {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return "empty-url";

  try {
    const parsedUrl = new URL(trimmedUrl);
    return `host=${parsedUrl.hostname} urlHash=${shortHash(parsedUrl.toString())}`;
  } catch {
    return `invalid-url urlHash=${shortHash(trimmedUrl)}`;
  }
}

type ScraperSearchCriteria = {
  location?: unknown;
  services?: unknown;
  experience?: unknown;
  keywords?: unknown;
  maxDistance?: unknown;
  minRating?: unknown;
  minBudget?: unknown;
  maxBudget?: unknown;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function countServices(services: unknown) {
  if (Array.isArray(services)) return services.length;
  if (typeof services === "string") {
    return services
      .split(",")
      .map(service => service.trim())
      .filter(Boolean).length;
  }
  return 0;
}

function formatNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "unset";
}

export function describeScraperSearchCriteria(criteria: ScraperSearchCriteria) {
  const hasBudget = hasText(criteria.minBudget) || hasText(criteria.maxBudget);

  return [
    `location=${hasText(criteria.location) ? "present" : "missing"}`,
    `services=${countServices(criteria.services)}`,
    `experience=${hasText(criteria.experience) ? "present" : "missing"}`,
    `keywords=${hasText(criteria.keywords) ? "present" : "missing"}`,
    `maxDistance=${formatNumber(criteria.maxDistance)}`,
    `minRating=${formatNumber(criteria.minRating)}`,
    `budget=${hasBudget ? "present" : "missing"}`,
  ].join(" ");
}
