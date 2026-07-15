export type CampaignSafetyPolicy = {
  dailySendLimit: number;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type CampaignOperationMode = "reviewed_outreach" | "dry_run";

export const DEFAULT_CAMPAIGN_SAFETY_POLICY: CampaignSafetyPolicy = {
  dailySendLimit: 5,
  quietHoursStart: "20:00",
  quietHoursEnd: "08:00",
};

export const DEFAULT_CAMPAIGN_OPERATION_MODE: CampaignOperationMode =
  "reviewed_outreach";

export const MIN_DAILY_SEND_LIMIT = 1;
export const MAX_DAILY_SEND_LIMIT = 20;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeCampaignSafetyPolicy(
  value: unknown
): CampaignSafetyPolicy {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    dailySendLimit: normalizeDailySendLimit(source.dailySendLimit),
    quietHoursStart: normalizeQuietHour(
      source.quietHoursStart,
      DEFAULT_CAMPAIGN_SAFETY_POLICY.quietHoursStart,
      "quietHoursStart"
    ),
    quietHoursEnd: normalizeQuietHour(
      source.quietHoursEnd,
      DEFAULT_CAMPAIGN_SAFETY_POLICY.quietHoursEnd,
      "quietHoursEnd"
    ),
  };
}

export function mergeCampaignSafetyPolicy<T extends Record<string, unknown>>(
  criteria: T
): T & {
  operationMode: CampaignOperationMode;
  safetyPolicy: CampaignSafetyPolicy;
} {
  const safetyPolicy = normalizeCampaignSafetyPolicy(criteria.safetyPolicy);
  if (safetyPolicy.quietHoursStart === safetyPolicy.quietHoursEnd) {
    throw new Error("Quiet hours start and end must be different.");
  }
  return {
    ...criteria,
    operationMode: normalizeCampaignOperationMode(criteria.operationMode),
    safetyPolicy,
  };
}

export function parseCampaignSearchCriteria(value: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Campaign searchCriteria must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Campaign searchCriteria must be a JSON object.");
  }

  return mergeCampaignSafetyPolicy(parsed as Record<string, unknown>);
}

export function isWithinQuietHours(date: Date, policy: CampaignSafetyPolicy) {
  const current = getMinutesOfDay(date);
  const start = getMinutesFromTime(policy.quietHoursStart);
  const end = getMinutesFromTime(policy.quietHoursEnd);

  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function normalizeCampaignOperationMode(
  value: unknown
): CampaignOperationMode {
  if (value === "dry_run") return "dry_run";
  if (value === "reviewed_outreach" || value === undefined || value === null) {
    return "reviewed_outreach";
  }
  throw new Error(
    "Campaign operation mode must be dry_run or reviewed_outreach."
  );
}

export function isDryRunSearchCriteria(searchCriteria: string | null) {
  return (
    parseCampaignSearchCriteria(searchCriteria || "{}").operationMode ===
    "dry_run"
  );
}

export function getQuietHoursEnd(date: Date, policy: CampaignSafetyPolicy) {
  const endMinutes = getMinutesFromTime(policy.quietHoursEnd);
  const endDate = new Date(date);
  endDate.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

  if (endDate <= date) {
    endDate.setDate(endDate.getDate() + 1);
  }

  return endDate;
}

export function getScheduledExecutionDecision(
  searchCriteria: Record<string, unknown>,
  now = new Date()
) {
  const safetyPolicy = normalizeCampaignSafetyPolicy(
    searchCriteria.safetyPolicy
  );
  const quietHoursActive = isWithinQuietHours(now, safetyPolicy);
  return {
    safetyPolicy,
    quietHoursActive,
    nextAllowedExecutionAt: quietHoursActive
      ? getQuietHoursEnd(now, safetyPolicy)
      : now,
  };
}

export function countSuccessfulSendsToday(
  attempts: Array<{
    status: string;
    finishedAt?: Date | string | null;
    createdAt: Date | string;
  }>,
  now = new Date()
) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  return attempts.filter(attempt => {
    if (attempt.status !== "succeeded") return false;
    const timestamp = new Date(attempt.finishedAt ?? attempt.createdAt);
    return timestamp >= dayStart && timestamp <= now;
  }).length;
}

function normalizeDailySendLimit(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : DEFAULT_CAMPAIGN_SAFETY_POLICY.dailySendLimit;

  if (!Number.isInteger(parsed)) {
    throw new Error("Daily send limit must be a whole number.");
  }

  if (parsed < MIN_DAILY_SEND_LIMIT || parsed > MAX_DAILY_SEND_LIMIT) {
    throw new Error(
      `Daily send limit must be between ${MIN_DAILY_SEND_LIMIT} and ${MAX_DAILY_SEND_LIMIT}.`
    );
  }

  return parsed;
}

function normalizeQuietHour(value: unknown, fallback: string, field: string) {
  const normalized = typeof value === "string" ? value.trim() : fallback;
  if (!TIME_PATTERN.test(normalized)) {
    throw new Error(`${field} must use HH:mm 24-hour time.`);
  }
  return normalized;
}

function getMinutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getMinutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}
