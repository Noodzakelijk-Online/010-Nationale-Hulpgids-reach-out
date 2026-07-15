export type AuditCategory =
  | "all"
  | "approval"
  | "send"
  | "response"
  | "credential"
  | "candidate"
  | "campaign"
  | "other";

export type AuditEventLike = {
  action?: string | null;
  entityType?: string | null;
};

export function getAuditCategory(event: AuditEventLike): AuditCategory {
  const value = `${event.action ?? ""} ${event.entityType ?? ""}`.toLowerCase();
  if (value.includes("send") || value.includes("delivery")) return "send";
  if (
    value.includes("approval") ||
    value.includes("approved") ||
    value.includes("rejected")
  ) {
    return "approval";
  }
  if (value.includes("response")) return "response";
  if (value.includes("credential")) return "credential";
  if (
    value.includes("candidate") ||
    value.includes("duplicate") ||
    value.includes("qualification") ||
    value.includes("identity")
  ) {
    return "candidate";
  }
  if (value.includes("campaign")) return "campaign";
  return "other";
}

export function formatAuditActionLabel(action: string) {
  return action
    .split(/[._-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
