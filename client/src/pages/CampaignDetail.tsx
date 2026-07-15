import DashboardLayout from "@/components/DashboardLayout";
import { useState, type ReactNode } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getNextActionRoute } from "@/lib/nextActionRoutes";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ClipboardCheck,
  Download,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

const priorityVariant: Record<string, "destructive" | "secondary" | "outline"> =
  {
    high: "destructive",
    medium: "secondary",
    low: "outline",
  };

const readinessVariant: Record<
  string,
  "destructive" | "secondary" | "outline"
> = {
  blocked: "destructive",
  warning: "secondary",
  ready: "outline",
};

const qualificationLabels: Record<string, string> = {
  qualified: "Qualified",
  not_qualified: "Not qualified",
  needs_review: "Needs review",
  awaiting_decision: "Awaiting decision",
};

export default function CampaignDetail() {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [candidateImportText, setCandidateImportText] = useState("");
  const [candidateImportAcknowledged, setCandidateImportAcknowledged] =
    useState(false);
  const [candidateImportResult, setCandidateImportResult] = useState<any>(null);
  const [location] = useLocation();
  const campaignId = Number(location.split("/").filter(Boolean).pop());
  const invalidId = !Number.isFinite(campaignId);
  const utils = trpc.useUtils();
  const { data: ledger, isLoading } =
    trpc.campaigns.getOperatingLedger.useQuery(
      { campaignId },
      { enabled: !invalidId }
    );
  const exportLedger = trpc.campaigns.exportLedger.useMutation({
    onSuccess: exportedLedger => {
      const exportMode = exportedLedger.personalDataIncluded
        ? "full"
        : "redacted";
      const fileName = `${sanitizeFilename(ledger?.campaign?.title || "campaign")}-ledger-${exportMode}-export.json`;
      const blob = new Blob([JSON.stringify(exportedLedger, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(
        exportedLedger.personalDataIncluded
          ? "Full campaign ledger export prepared"
          : "Redacted campaign ledger export prepared"
      );
      setExportDialogOpen(false);
    },
    onError: error => {
      toast.error(`Failed to export campaign ledger: ${error.message}`);
    },
  });
  const importCandidates = trpc.candidates.importManual.useMutation({
    onSuccess: async result => {
      setCandidateImportResult(result);
      setCandidateImportText("");
      setCandidateImportAcknowledged(false);
      await utils.campaigns.getOperatingLedger.invalidate({ campaignId });
      await utils.candidates.list.invalidate({ campaignId });
      toast.success(
        `Imported ${result.importedCount} candidate${result.importedCount === 1 ? "" : "s"}`
      );
    },
    onError: error => {
      toast.error(`Candidate import failed: ${error.message}`);
    },
  });

  const handleExportLedger = (includePersonalData: boolean) => {
    if (invalidId) return;
    exportLedger.mutate({
      campaignId,
      includePersonalData,
      personalDataAcknowledged: includePersonalData,
    });
  };

  const handleImportCandidates = () => {
    if (invalidId || !ledger) return;

    const parsedCandidates = parseCandidateImportText(candidateImportText);
    if (parsedCandidates.length === 0) {
      toast.error("Paste at least one candidate row before importing");
      return;
    }
    if (parsedCandidates.length > 25) {
      toast.error("Import at most 25 candidates at a time");
      return;
    }

    importCandidates.mutate({
      campaignId,
      candidates: parsedCandidates,
      personalDataAcknowledged: candidateImportAcknowledged,
      sourceLabel: "campaign_detail_paste",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/campaigns">
              <Button variant="ghost" size="sm" className="mb-2 gap-2">
                <ArrowLeft className="h-4 w-4" />
                Campaigns
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              {ledger?.campaign.title || "Campaign ledger"}
            </h1>
            <p className="text-gray-600 mt-1">
              Readiness, candidate quality, approvals, send evidence, responses,
              and audit activity
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:mt-10">
            {ledger?.readiness && (
              <Badge
                variant={readinessVariant[ledger.readiness.status] || "outline"}
              >
                {ledger.readiness.status}
              </Badge>
            )}
            {ledger && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setExportDialogOpen(true)}
                data-testid="export-campaign-ledger"
              >
                <Download className="h-4 w-4" />
                Export ledger
              </Button>
            )}
          </div>
        </div>

        {invalidId ? (
          <EmptyState
            title="Invalid campaign"
            description="The campaign URL does not contain a valid id."
          />
        ) : isLoading ? (
          <EmptyState
            title="Loading ledger..."
            description="Collecting operating state for this campaign."
          />
        ) : !ledger ? (
          <EmptyState
            title="Campaign not found"
            description="No ledger data is available for this campaign."
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Candidates"
                value={ledger.summary.candidatesDiscovered}
              />
              <Metric
                label="Qualified"
                value={ledger.summary.candidatesQualified}
              />
              <Metric
                label="Needs qualification"
                value={
                  ledger.summary.candidatesNeedsReview +
                  ledger.summary.candidatesAwaitingQualification
                }
              />
              <Metric
                label="Queued review"
                value={ledger.summary.messagesQueued}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" />
                  Campaign Quality
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <QualityMetric
                    label="Response rate"
                    value={formatRate(ledger.quality.responseRate)}
                    detail={`${ledger.quality.responsesReceived} response${ledger.quality.responsesReceived === 1 ? "" : "s"} from ${ledger.quality.contacted} contacted`}
                  />
                  <QualityMetric
                    label="Acceptance rate"
                    value={formatRate(ledger.quality.acceptanceRate)}
                    detail={`${ledger.quality.interested} interested response${ledger.quality.interested === 1 ? "" : "s"}`}
                  />
                  <QualityMetric
                    label="Pending responses"
                    value={ledger.quality.pendingResponses}
                    detail="Sent or delivered messages without a response"
                  />
                  <QualityMetric
                    label="Avg response time"
                    value={formatHours(ledger.quality.averageResponseTimeHours)}
                    detail="Based on responses with send timestamps"
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <div className="mb-3 font-medium">
                      Candidate qualification
                    </div>
                    <div className="space-y-2">
                      <BreakdownRow
                        label="Qualified"
                        value={ledger.quality.qualificationBreakdown.qualified}
                      />
                      <BreakdownRow
                        label="Not qualified"
                        value={
                          ledger.quality.qualificationBreakdown.not_qualified
                        }
                      />
                      <BreakdownRow
                        label="Needs review"
                        value={
                          ledger.quality.qualificationBreakdown.needs_review
                        }
                      />
                      <BreakdownRow
                        label="Awaiting decision"
                        value={
                          ledger.quality.qualificationBreakdown
                            .awaiting_decision
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="mb-3 font-medium">
                      Response classification
                    </div>
                    <div className="space-y-2">
                      <BreakdownRow
                        label="Interested"
                        value={
                          ledger.quality.classificationBreakdown.interested
                        }
                      />
                      <BreakdownRow
                        label="More information"
                        value={ledger.quality.moreInformationNeeded}
                      />
                      <BreakdownRow
                        label="Needs review"
                        value={ledger.quality.needsResponseReview}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="mb-3 font-medium">Rejection reasons</div>
                    <div className="space-y-2">
                      <BreakdownRow
                        label="Not interested"
                        value={ledger.quality.rejectionBreakdown.notInterested}
                      />
                      <BreakdownRow
                        label="Unavailable"
                        value={ledger.quality.rejectionBreakdown.unavailable}
                      />
                      <BreakdownRow
                        label="No response"
                        value={ledger.quality.rejectionBreakdown.noResponse}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-md border bg-slate-50 p-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Send failures</span>
                    <Badge
                      variant={
                        ledger.quality.sendFailureCount > 0
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {ledger.quality.sendFailureCount}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Delivery evidence rate
                    </span>
                    <span className="font-medium">
                      {formatRate(ledger.quality.deliveryEvidenceRate)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    Readiness
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ledger.readiness.checks.map((check: any) => (
                    <div
                      key={check.key}
                      className="flex items-start justify-between gap-4 rounded-md border p-3"
                    >
                      <div>
                        <div className="font-medium">{check.label}</div>
                        <div className="text-sm text-muted-foreground">
                          {check.detail}
                        </div>
                      </div>
                      <Badge
                        variant={readinessVariant[check.status] || "outline"}
                      >
                        {check.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                    Next Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ledger.nextActions.map((action: any, index: number) => {
                    const route = getNextActionRoute(action, campaignId);
                    return (
                      <div
                        key={`${action.label}-${index}`}
                        className="rounded-md border p-3"
                        data-testid={`campaign-next-action-${index}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium">{action.label}</div>
                          <Badge
                            variant={
                              priorityVariant[action.priority] || "outline"
                            }
                          >
                            {action.priority}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {action.detail}
                        </p>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="mt-3"
                        >
                          <Link href={route.href}>{route.cta}</Link>
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-blue-600" />
                  Candidates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ledger.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No candidates discovered yet.
                  </p>
                ) : (
                  ledger.candidates.map((candidate: any) => (
                    <div
                      key={candidate.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{candidate.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {candidate.location || "No location"} -{" "}
                          {candidate.status}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {
                            qualificationLabels[
                              getCandidateQualification(
                                ledger.latestQualificationDecisions,
                                candidate.id
                              )?.decision || "awaiting_decision"
                            ]
                          }
                        </Badge>
                        <Badge variant="outline">
                          {candidate.compatibilityScore}%
                        </Badge>
                        <Link href={`/candidates/${candidate.id}`}>
                          <Button variant="outline" size="sm">
                            Open ledger
                          </Button>
                        </Link>
                        {candidate.profileUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(
                                candidate.profileUrl,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-indigo-600" />
                  Import Candidates
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={candidateImportText}
                  onChange={event =>
                    setCandidateImportText(event.target.value.slice(0, 10000))
                  }
                  rows={6}
                  placeholder={
                    "name,email,phone,profileUrl,location,services,hourlyRate,bio\nSanne Jansen,sanne@example.nl,+31612345678,https://example.nl/profiel/sanne,Arnhem,Begeleiding,25,Ervaren begeleider"
                  }
                  data-testid="candidate-import-text"
                />
                <div className="flex items-start gap-3 rounded-md border bg-amber-50 p-3">
                  <Checkbox
                    id="candidateImportAcknowledged"
                    checked={candidateImportAcknowledged}
                    onCheckedChange={checked =>
                      setCandidateImportAcknowledged(Boolean(checked))
                    }
                    data-testid="candidate-import-ack"
                  />
                  <label
                    htmlFor="candidateImportAcknowledged"
                    className="text-sm text-amber-950"
                  >
                    I confirm these rows contain candidate personal data that
                    Robert has a clear operational reason to import into this
                    campaign ledger. Imported rows may create duplicate review
                    warnings before outreach can continue.
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Use a header row or the default order shown above. Maximum
                    25 rows per import.
                  </p>
                  <Button
                    type="button"
                    onClick={handleImportCandidates}
                    disabled={
                      importCandidates.isPending || !candidateImportAcknowledged
                    }
                    data-testid="candidate-import-submit"
                  >
                    {importCandidates.isPending
                      ? "Importing..."
                      : "Import candidates"}
                  </Button>
                </div>
                {candidateImportResult && (
                  <div
                    className="rounded-md border bg-slate-50 p-3 text-sm"
                    data-testid="candidate-import-result"
                  >
                    <div className="font-medium">
                      Imported {candidateImportResult.importedCount} candidate
                      {candidateImportResult.importedCount === 1 ? "" : "s"}.
                    </div>
                    <div className="mt-3 space-y-2">
                      {candidateImportResult.imported
                        .slice(0, 5)
                        .map((entry: any) => (
                          <div
                            key={entry.id}
                            className="rounded-md border bg-white p-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{entry.name}</span>
                              <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">
                                  {entry.compatibilityScore}% match
                                </Badge>
                                <Badge variant="secondary">
                                  {entry.recommendation}
                                </Badge>
                              </div>
                            </div>
                            {entry.matchReasons?.length > 0 && (
                              <p className="mt-1 text-muted-foreground">
                                {entry.matchReasons.slice(0, 2).join("; ")}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                    {candidateImportResult.duplicateWarningCount > 0 ? (
                      <div className="mt-2 space-y-2">
                        <Badge variant="secondary">
                          {candidateImportResult.duplicateWarningCount}{" "}
                          duplicate warning
                          {candidateImportResult.duplicateWarningCount === 1
                            ? ""
                            : "s"}
                        </Badge>
                        {candidateImportResult.imported
                          .filter(
                            (entry: any) => entry.duplicateWarningCount > 0
                          )
                          .map((entry: any) => (
                            <div
                              key={entry.id}
                              className="text-muted-foreground"
                            >
                              {entry.name}: showing{" "}
                              {entry.duplicateWarnings.length} of{" "}
                              {entry.duplicateWarningCount} warning
                              {entry.duplicateWarningCount === 1
                                ? ""
                                : "s"} -{" "}
                              {entry.duplicateWarnings
                                .map(
                                  (warning: any) =>
                                    `${warning.candidateName} (${warning.confidence}%)`
                                )
                                .join(", ")}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        No duplicate warnings were returned.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <LedgerList
                icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
                title="Messages"
                items={ledger.messages}
                empty="No message drafts yet."
                renderItem={(message: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">
                        {message.subject || "Untitled message"}
                      </div>
                      <Badge variant="outline">{message.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {message.content}
                    </p>
                  </div>
                )}
              />
              <LedgerList
                icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
                title="Send Attempts"
                items={ledger.sendAttempts}
                empty="No send attempts recorded."
                renderItem={(attempt: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">
                        Message #{attempt.messageId}
                      </div>
                      <Badge
                        variant={
                          attempt.status === "failed" ||
                          attempt.status === "blocked"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {attempt.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {attempt.confirmationText ||
                        attempt.errorMessage ||
                        "No evidence text recorded"}
                    </p>
                  </div>
                )}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Responses, Rate Limits, And Audit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CompactCount
                  label="Responses"
                  value={ledger.responses.length}
                />
                <CompactCount
                  label="Rate-limit warnings"
                  value={ledger.rateLimitEvents.length}
                />
                <CompactCount
                  label="Audit events"
                  value={ledger.auditEvents.length}
                />
                <Separator />
                {ledger.auditEvents.slice(0, 5).map((event: any) => (
                  <div key={event.id} className="text-sm">
                    <span className="font-medium">{event.action}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      - {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
                {ledger.auditEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No audit events recorded for this campaign.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export campaign ledger?</AlertDialogTitle>
            <AlertDialogDescription>
              Redacted export keeps operational status, counts, dates, and
              decisions while removing candidate contact details, profile text,
              message bodies, responses, and send evidence. Full export includes
              candidate personal data and should only be used for a clear
              operational reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exportLedger.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                handleExportLedger(false);
              }}
              disabled={exportLedger.isPending}
              data-testid="confirm-export-redacted-campaign-ledger"
            >
              {exportLedger.isPending ? "Exporting..." : "Export redacted"}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                handleExportLedger(true);
              }}
              disabled={exportLedger.isPending}
              data-testid="confirm-export-campaign-ledger"
            >
              {exportLedger.isPending ? "Exporting..." : "Export full JSON"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function QualityMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function CompactCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function getCandidateQualification(
  decisions: Array<{ candidateId: number; decision: string }> | undefined,
  candidateId: number
) {
  return decisions?.find(decision => decision.candidateId === candidateId);
}

function formatRate(value: number | undefined) {
  return `${(value ?? 0).toFixed(1)}%`;
}

function formatHours(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(1)}h` : "N/A";
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

function parseCandidateImportText(value: string) {
  const lines = value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const firstRow = splitDelimitedLine(lines[0]);
  const hasHeader = firstRow.some(cell =>
    ["name", "email", "phone", "profileurl", "location"].includes(
      normalizeImportHeader(cell)
    )
  );
  const headers = hasHeader
    ? firstRow.map(normalizeImportHeader)
    : ["name", "email", "phone", "profileurl", "location", "services", "bio"];
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map(line => {
      const cells = splitDelimitedLine(line);
      const record = new Map<string, string>();
      headers.forEach((header, index) => {
        record.set(header, cells[index]?.trim() || "");
      });

      return {
        name: record.get("name") || "",
        email: record.get("email") || undefined,
        phone: record.get("phone") || undefined,
        profileUrl:
          record.get("profileurl") ||
          record.get("profile") ||
          record.get("url") ||
          undefined,
        location: record.get("location") || undefined,
        services: record.get("services") || undefined,
        experience: record.get("experience") || undefined,
        availability: record.get("availability") || undefined,
        hourlyRate:
          record.get("hourlyrate") ||
          record.get("rate") ||
          record.get("tarief") ||
          undefined,
        bio: record.get("bio") || record.get("notes") || undefined,
        platformName:
          record.get("platform") || record.get("platformname") || undefined,
      };
    })
    .filter(candidate => candidate.name);
}

function splitDelimitedLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function normalizeImportHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function LedgerList({
  icon,
  title,
  items,
  empty,
  renderItem,
}: {
  icon: ReactNode;
  title: string;
  items: any[];
  empty: string;
  renderItem: (item: any) => ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.map((item: any) => (
            <div key={item.id} className="rounded-md border p-3">
              {renderItem(item)}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
