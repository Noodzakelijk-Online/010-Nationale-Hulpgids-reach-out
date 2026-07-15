import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

const sensitiveFollowUpPattern =
  /\b(medicatie|diagnose|beperking|zorgvraag|persoonlijke verzorging|intimiteit|trauma|privacy|bsn|medisch|gezondheid|verpleging|toilet|wassen|aankleden)\b/i;

function hasSensitiveFollowUpContent(followUp: any) {
  const message = followUp?.message;
  return sensitiveFollowUpPattern.test(
    `${message?.subject || ""}\n${message?.content || ""}`
  );
}

export default function FollowUpQueue() {
  const utils = trpc.useUtils();
  const { data: followUps, isLoading } = trpc.followUps.getDue.useQuery();
  const { data: suggestions, isLoading: suggestionsLoading } =
    trpc.followUps.getSuggestions.useQuery({
      minDaysSinceContact: 5,
      limit: 10,
    });
  const [sensitiveFollowUp, setSensitiveFollowUp] = useState<any>(null);
  const [sensitiveAcknowledged, setSensitiveAcknowledged] = useState(false);
  const prepareFollowUp = trpc.followUps.prepare.useMutation({
    onSuccess: () => {
      toast.success("Follow-up draft created");
      utils.followUps.getDue.invalidate();
      utils.followUps.getSuggestions.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const approveFollowUp = trpc.followUps.approve.useMutation({
    onSuccess: () => {
      toast.success("Follow-up draft approved");
      setSensitiveFollowUp(null);
      setSensitiveAcknowledged(false);
      utils.followUps.getDue.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const skipFollowUp = trpc.followUps.skip.useMutation({
    onSuccess: () => {
      toast.success("Follow-up skipped");
      utils.followUps.getDue.invalidate();
      utils.followUps.getSuggestions.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const handleApproveFollowUp = (followUp: any) => {
    if (hasSensitiveFollowUpContent(followUp)) {
      setSensitiveFollowUp(followUp);
      setSensitiveAcknowledged(false);
      return;
    }

    approveFollowUp.mutate({ followUpId: followUp.id });
  };

  const handleSensitiveApproval = () => {
    if (!sensitiveFollowUp) return;

    approveFollowUp.mutate({
      followUpId: sensitiveFollowUp.id,
      sensitiveContentAcknowledged: sensitiveAcknowledged,
      reason: "Sensitive follow-up content reviewed",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Follow-up Queue</h1>
          <p className="text-gray-600 mt-1">
            Approve or skip due follow-up drafts before any external sending
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-amber-600" />
              Suggested follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Candidates contacted at least 5 days ago with no recorded
              response and no active follow-up draft.
            </p>
            {suggestionsLoading ? (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                Loading suggestions...
              </div>
            ) : !suggestions || suggestions.length === 0 ? (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                No stale no-response candidates need a draft.
              </div>
            ) : (
              <div className="grid gap-3">
                {suggestions.map((suggestion: any) => {
                  const draft = buildSuggestedFollowUpDraft(suggestion);
                  return (
                    <div
                      key={`${suggestion.candidateId}-${suggestion.messageId}`}
                      className="rounded-md border p-3"
                      data-testid={`follow-up-suggestion-${suggestion.candidateId}`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">
                              {suggestion.candidate?.name ||
                                "Unknown candidate"}
                            </div>
                            <Badge variant="outline">
                              {suggestion.daysSinceContact} days quiet
                            </Badge>
                            <Badge variant="secondary">
                              {suggestion.platform?.name ||
                                "Unknown platform"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {suggestion.campaign?.title || "Unknown campaign"}
                            {suggestion.message?.subject
                              ? ` · ${suggestion.message.subject}`
                              : ""}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Draft will be queued for review. It will not be sent
                            until approved and recorded with delivery evidence.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          data-testid={`prepare-follow-up-suggestion-${suggestion.candidateId}`}
                          disabled={prepareFollowUp.isPending}
                          onClick={() =>
                            prepareFollowUp.mutate({
                              candidateId: suggestion.candidateId,
                              subject: draft.subject,
                              content: draft.content,
                              sequence: suggestion.sequence,
                            })
                          }
                        >
                          Create draft
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading follow-ups...
            </CardContent>
          </Card>
        ) : !followUps || followUps.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No due follow-ups
              </h3>
              <p className="text-gray-600">
                Follow-up drafts will appear here when they are scheduled and
                due.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {followUps.map((followUp: any) => {
              const hasSensitiveContent = hasSensitiveFollowUpContent(followUp);

              return (
                <Card key={followUp.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg">
                          {followUp.candidate?.name || "Unknown candidate"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {followUp.campaign?.title || "Unknown campaign"}
                        </p>
                      </div>
                      <Badge variant="outline">
                        Sequence {followUp.sequence}
                      </Badge>
                    </div>
                    {hasSensitiveContent && (
                      <Badge
                        variant="outline"
                        className="mt-3 w-fit border-amber-300 bg-amber-50 text-amber-800"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Sensitive care/personal context
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-gray-50 p-4 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <MessageSquare className="h-4 w-4 text-blue-600" />
                        {followUp.message?.subject || "Follow-up draft"}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">
                        {followUp.message?.content || "No linked draft content"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Due {new Date(followUp.scheduledAt).toLocaleString()}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            skipFollowUp.mutate({ followUpId: followUp.id })
                          }
                          disabled={skipFollowUp.isPending}
                        >
                          <SkipForward className="h-4 w-4 mr-2" />
                          Skip
                        </Button>
                        <Button
                          data-testid={`approve-follow-up-${followUp.id}`}
                          onClick={() => handleApproveFollowUp(followUp)}
                          disabled={
                            approveFollowUp.isPending ||
                            followUp.message?.status === "approved"
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {followUp.message?.status === "approved"
                            ? "Approved"
                            : "Approve Draft"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <AlertDialog
          open={!!sensitiveFollowUp}
          onOpenChange={open => {
            if (!open) {
              setSensitiveFollowUp(null);
              setSensitiveAcknowledged(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve sensitive follow-up?</AlertDialogTitle>
              <AlertDialogDescription>
                This follow-up includes care, health, or personal-context
                warnings. Review the draft before approving it for controlled
                delivery.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    Sensitive follow-up approval safeguard
                  </p>
                  <p>
                    Approval only moves this follow-up draft into the
                    evidence-backed send queue. It still cannot be marked sent
                    without delivery evidence.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={sensitiveAcknowledged}
                  onCheckedChange={checked =>
                    setSensitiveAcknowledged(checked === true)
                  }
                  data-testid="sensitive-follow-up-ack"
                />
                <span>
                  I reviewed the follow-up draft and the sensitive-context
                  warning before approval.
                </span>
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={approveFollowUp.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSensitiveApproval}
                disabled={approveFollowUp.isPending || !sensitiveAcknowledged}
                className="bg-green-600 text-white hover:bg-green-700"
                data-testid="sensitive-follow-up-confirm"
              >
                Approve Draft
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

function buildSuggestedFollowUpDraft(suggestion: any) {
  const candidateName = suggestion.candidate?.name || "daar";
  return {
    subject: "Vriendelijke opvolging",
    content: `Beste ${candidateName},\n\nIk wilde mijn eerdere bericht nog een keer vriendelijk onder de aandacht brengen. Als het past, hoor ik graag of u openstaat voor een korte kennismaking.\n\nAls het nu niet uitkomt, is dat natuurlijk ook helemaal goed.\n\nMet vriendelijke groet,\nRobert`,
  };
}
