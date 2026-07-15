import { describe, expect, it } from "vitest";
import {
  formatAuditActionLabel,
  getAuditCategory,
} from "@/lib/auditEvents";

describe("audit event helpers", () => {
  it.each([
    ["message.approval_blocked_by_response", "message", "approval"],
    ["message.bulk_status_approved", "message", "approval"],
    ["message.rejected", "message", "approval"],
    ["message.send_blocked_not_currently_approved", "message", "send"],
    ["message.delivery_confirmed", "message", "send"],
    ["candidate.response_recorded", "candidateResponse", "response"],
    ["credential.saved", "platformCredential", "credential"],
    ["candidate_duplicate.not_duplicate", "candidate", "candidate"],
    ["candidate_identity.merged", "candidate", "candidate"],
    ["campaign.archived", "campaign", "campaign"],
    ["queue.cancelled", "queueJob", "other"],
  ] as const)(
    "classifies %s / %s as %s",
    (action, entityType, expectedCategory) => {
      expect(getAuditCategory({ action, entityType })).toBe(expectedCategory);
    }
  );

  it("formats machine action names for operator review", () => {
    expect(formatAuditActionLabel("message.send_blocked_archived_campaign")).toBe(
      "Message Send Blocked Archived Campaign"
    );
  });
});
