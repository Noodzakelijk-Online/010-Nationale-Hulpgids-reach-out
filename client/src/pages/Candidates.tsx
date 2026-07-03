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
import { getInitialSearchParam } from "@/lib/urlFilters";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  MapPin,
  UserRound,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type QualificationFilter =
  | "all"
  | "needs_qualification"
  | "qualified"
  | "needs_review"
  | "not_qualified"
  | "awaiting_decision";
type DuplicateFilter = "all" | "needs_duplicate_review";

const qualificationLabels: Record<QualificationFilter, string> = {
  all: "All",
  needs_qualification: "Needs qualification",
  qualified: "Qualified",
  needs_review: "Needs review",
  not_qualified: "Not qualified",
  awaiting_decision: "Awaiting",
};

const qualificationDescriptions: Record<
  Exclude<QualificationFilter, "all">,
  string
> = {
  needs_qualification: "Awaiting a decision or marked for review",
  qualified: "Qualified for controlled outreach",
  needs_review: "Needs manual review before outreach",
  not_qualified: "Do not contact unless decision changes",
  awaiting_decision: "No qualification decision recorded",
};

const duplicateFilterLabels: Record<DuplicateFilter, string> = {
  all: "All candidates",
  needs_duplicate_review: "Duplicate review",
};

export default function Candidates() {
  const { data: candidates, isLoading } = trpc.candidates.list.useQuery({});
  const utils = trpc.useUtils();
  const [qualificationFilter, setQualificationFilter] =
    useState<QualificationFilter>(() =>
      getInitialSearchParam(
        "qualification",
        [
          "all",
          "needs_qualification",
          "qualified",
          "needs_review",
          "not_qualified",
          "awaiting_decision",
        ] as const,
        "all"
      )
    );
  const [duplicateFilter, setDuplicateFilter] = useState<DuplicateFilter>(() =>
    getInitialSearchParam(
      "duplicates",
      ["all", "needs_duplicate_review"] as const,
      "all"
    )
  );
  const [selectedDuplicatePairKeys, setSelectedDuplicatePairKeys] = useState<
    string[]
  >([]);
  const [batchDismissDialogOpen, setBatchDismissDialogOpen] = useState(false);
  const [batchDismissAcknowledged, setBatchDismissAcknowledged] =
    useState(false);
  const candidateList = candidates ?? [];
  const qualificationCounts = useMemo(() => {
    const counts: Record<QualificationFilter, number> = {
      all: candidateList.length,
      needs_qualification: 0,
      qualified: 0,
      needs_review: 0,
      not_qualified: 0,
      awaiting_decision: 0,
    };

    for (const candidate of candidateList as any[]) {
      const state = getQualificationState(candidate);
      counts[state] += 1;
      if (state === "awaiting_decision" || state === "needs_review") {
        counts.needs_qualification += 1;
      }
    }

    return counts;
  }, [candidateList]);
  const duplicateCounts = useMemo(() => {
    let needsDuplicateReview = 0;
    for (const candidate of candidateList as any[]) {
      if ((candidate.duplicateSummary?.unresolvedCount ?? 0) > 0) {
        needsDuplicateReview += 1;
      }
    }
    return {
      all: candidateList.length,
      needs_duplicate_review: needsDuplicateReview,
    };
  }, [candidateList]);
  const duplicateQueueQuery = trpc.candidates.getDuplicateReviewQueue.useQuery(
    { limit: 10 },
    { enabled: duplicateCounts.needs_duplicate_review > 0 }
  );
  const duplicateQueue = duplicateQueueQuery.data ?? [];
  const selectedDuplicatePairs = useMemo(() => {
    const selectedKeys = new Set(selectedDuplicatePairKeys);
    return duplicateQueue.filter((pair: any) => selectedKeys.has(pair.pairKey));
  }, [duplicateQueue, selectedDuplicatePairKeys]);
  const mergeDuplicate = trpc.candidates.mergeDuplicate.useMutation({
    onSuccess: () => {
      toast.success("Duplicate identity merged");
      setSelectedDuplicatePairKeys([]);
      utils.candidates.list.invalidate({});
      utils.candidates.getDuplicateReviewQueue.invalidate();
      utils.candidates.getDuplicates.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const resolveDuplicatePair = trpc.candidates.resolveDuplicatePair.useMutation(
    {
      onSuccess: () => {
        toast.success("Duplicate pair dismissed");
        setSelectedDuplicatePairKeys([]);
        utils.candidates.list.invalidate({});
        utils.candidates.getDuplicateReviewQueue.invalidate();
      },
      onError: error => toast.error(error.message),
    }
  );
  const resolveDuplicatePairsBatch =
    trpc.candidates.resolveDuplicatePairsBatch.useMutation({
      onSuccess: result => {
        toast.success(`Dismissed ${result.resolvedCount} duplicate pairs`);
        setSelectedDuplicatePairKeys([]);
        setBatchDismissAcknowledged(false);
        setBatchDismissDialogOpen(false);
        utils.candidates.list.invalidate({});
        utils.candidates.getDuplicateReviewQueue.invalidate();
      },
      onError: error => toast.error(error.message),
    });
  const filteredCandidates = useMemo(() => {
    return (candidateList as any[]).filter(candidate => {
      if (
        qualificationFilter !== "all" &&
        (qualificationFilter === "needs_qualification"
          ? !["awaiting_decision", "needs_review"].includes(
              getQualificationState(candidate)
            )
          : getQualificationState(candidate) !== qualificationFilter)
      ) {
        return false;
      }
      if (
        duplicateFilter === "needs_duplicate_review" &&
        (candidate.duplicateSummary?.unresolvedCount ?? 0) === 0
      ) {
        return false;
      }
      return true;
    });
  }, [candidateList, duplicateFilter, qualificationFilter]);
  const toggleDuplicatePairSelection = (pairKey: string) => {
    setSelectedDuplicatePairKeys(previous =>
      previous.includes(pairKey)
        ? previous.filter(key => key !== pairKey)
        : [...previous, pairKey]
    );
  };
  const clearDuplicatePairSelection = () => {
    setSelectedDuplicatePairKeys([]);
    setBatchDismissAcknowledged(false);
  };
  const submitBatchDismiss = () => {
    if (selectedDuplicatePairs.length === 0) return;
    resolveDuplicatePairsBatch.mutate({
      pairs: selectedDuplicatePairs.map((pair: any) => ({
        targetCandidateId: pair.targetCandidate.id,
        sourceCandidateId: pair.sourceCandidate.id,
      })),
      decision: "not_duplicate",
      reason:
        "Batch duplicate review: selected pairs were reviewed and confirmed as different people.",
      reviewedCurrentQueueAcknowledged: batchDismissAcknowledged,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>
          <p className="mt-1 text-gray-600">
            Review discovered helpers, source platforms, match quality, and
            ledger status
          </p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading candidates...
            </CardContent>
          </Card>
        ) : candidateList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No candidates yet</h3>
              <p className="max-w-md text-center text-muted-foreground">
                Create a campaign to start discovering candidates across
                multiple platforms.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-md border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  Qualification triage
                </p>
                <p className="text-sm text-muted-foreground">
                  Filter candidates by the latest outreach qualification
                  decision.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "all",
                    "needs_qualification",
                    "qualified",
                    "needs_review",
                    "not_qualified",
                    "awaiting_decision",
                  ] as QualificationFilter[]
                ).map(filter => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={
                      qualificationFilter === filter ? "default" : "outline"
                    }
                    className="min-w-24 justify-center"
                    onClick={() => setQualificationFilter(filter)}
                  >
                    {qualificationLabels[filter]}
                    <span className="ml-2 text-xs opacity-75">
                      {qualificationCounts[filter]}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-md border bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  Duplicate safety
                </p>
                <p className="text-sm text-muted-foreground">
                  Surface candidates that should be merged or reviewed before
                  outreach.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "needs_duplicate_review"] as DuplicateFilter[]).map(
                  filter => (
                    <Button
                      key={filter}
                      type="button"
                      size="sm"
                      variant={
                        duplicateFilter === filter ? "default" : "outline"
                      }
                      className="min-w-36 justify-center"
                      onClick={() => setDuplicateFilter(filter)}
                    >
                      {duplicateFilterLabels[filter]}
                      <span className="ml-2 text-xs opacity-75">
                        {duplicateCounts[filter]}
                      </span>
                    </Button>
                  )
                )}
              </div>
            </div>

            {duplicateCounts.needs_duplicate_review > 0 && (
              <Card data-testid="guided-duplicate-review">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Fingerprint className="h-5 w-5 text-amber-600" />
                    Guided duplicate review
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Review likely duplicate pairs before outreach continues.
                    The queue shows only redacted match signals, not raw email
                    or phone values.
                  </p>
                  {duplicateQueueQuery.isLoading ? (
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      Loading duplicate pairs...
                    </div>
                  ) : duplicateQueue.length === 0 ? (
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      No unresolved duplicate pairs remain.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">
                            {selectedDuplicatePairs.length} selected for batch
                            dismissal
                          </p>
                          <p>
                            Batch actions can only dismiss reviewed pairs as not
                            duplicates. Identity merges remain single-pair.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={selectedDuplicatePairs.length === 0}
                            onClick={clearDuplicatePairSelection}
                          >
                            Clear
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              selectedDuplicatePairs.length === 0 ||
                              mergeDuplicate.isPending ||
                              resolveDuplicatePair.isPending ||
                              resolveDuplicatePairsBatch.isPending
                            }
                            onClick={() => setBatchDismissDialogOpen(true)}
                          >
                            Dismiss selected
                          </Button>
                        </div>
                      </div>
                      {duplicateQueue.map((pair: any) => (
                        <div
                          key={pair.pairKey}
                          className="rounded-md border p-3"
                          data-testid={`duplicate-pair-${pair.pairKey}`}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <label className="flex items-center gap-2 rounded-md border px-2 py-1">
                                  <Checkbox
                                    checked={selectedDuplicatePairKeys.includes(
                                      pair.pairKey
                                    )}
                                    onCheckedChange={() =>
                                      toggleDuplicatePairSelection(pair.pairKey)
                                    }
                                    data-testid={`select-duplicate-pair-${pair.pairKey}`}
                                  />
                                  <span className="text-xs font-medium">
                                    Select
                                  </span>
                                </label>
                                <Badge variant="destructive">
                                  {pair.confidence}% match
                                </Badge>
                                {pair.reasons.map((reason: string) => (
                                  <Badge key={reason} variant="outline">
                                    {reason}
                                  </Badge>
                                ))}
                              </div>
                              <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                                <DuplicateCandidateSummary
                                  label="Suggested identity"
                                  candidate={pair.targetCandidate}
                                />
                                <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                                <DuplicateCandidateSummary
                                  label="Possible duplicate"
                                  candidate={pair.sourceCandidate}
                                />
                              </div>
                              {pair.explanation && (
                                <DuplicateReviewExplanation
                                  explanation={pair.explanation}
                                />
                              )}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Link
                                href={`/candidates/${pair.targetCandidate.id}`}
                              >
                                <Button variant="outline" size="sm">
                                  Open target
                                </Button>
                              </Link>
                              <Link
                                href={`/candidates/${pair.sourceCandidate.id}`}
                              >
                                <Button variant="outline" size="sm">
                                  Open duplicate
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                data-testid={`merge-duplicate-pair-${pair.pairKey}`}
                                disabled={
                                  mergeDuplicate.isPending ||
                                  resolveDuplicatePair.isPending ||
                                  resolveDuplicatePairsBatch.isPending
                                }
                                onClick={() =>
                                  mergeDuplicate.mutate({
                                    targetCandidateId: pair.targetCandidate.id,
                                    sourceCandidateId: pair.sourceCandidate.id,
                                    reason: `Guided duplicate review: ${pair.reasons.join(", ")}`,
                                  })
                                }
                              >
                                Merge identity
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid={`dismiss-duplicate-pair-${pair.pairKey}`}
                                disabled={
                                  mergeDuplicate.isPending ||
                                  resolveDuplicatePair.isPending ||
                                  resolveDuplicatePairsBatch.isPending
                                }
                                onClick={() =>
                                  resolveDuplicatePair.mutate({
                                    targetCandidateId: pair.targetCandidate.id,
                                    sourceCandidateId: pair.sourceCandidate.id,
                                    decision: "not_duplicate",
                                    confidence: pair.confidence,
                                    reasons: pair.reasons,
                                    reason: `Guided duplicate review dismissed: ${pair.reasons.join(", ")}`,
                                  })
                                }
                              >
                                Not duplicate
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {filteredCandidates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">
                    No candidates in this state
                  </h3>
                  <p className="max-w-md text-muted-foreground">
                    Choose another qualification filter to continue triage.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCandidates.map((candidate: any) => {
                  const qualificationState = getQualificationState(candidate);
                  const duplicateCount =
                    candidate.duplicateSummary?.unresolvedCount ?? 0;
                  const duplicateReasons =
                    candidate.duplicateSummary?.reasons?.join(", ") ||
                    "possible duplicate identity";

                  return (
                    <Card
                      key={candidate.id}
                      className="transition-shadow hover:shadow-md"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-lg">
                              <UserRound className="h-5 w-5 text-blue-600" />
                              {candidate.name}
                            </CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {candidate.campaign?.title ||
                                `Campaign #${candidate.campaignId}`}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {candidate.compatibilityScore}%
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <Badge variant="secondary">
                            {candidate.platform?.name ||
                              `Platform #${candidate.platformId}`}
                          </Badge>
                          <Badge variant="outline">{candidate.status}</Badge>
                          <Badge
                            variant={getQualificationBadgeVariant(
                              qualificationState
                            )}
                            title={
                              qualificationDescriptions[qualificationState]
                            }
                          >
                            {qualificationLabels[qualificationState]}
                          </Badge>
                          {duplicateCount > 0 && (
                            <Badge
                              variant="destructive"
                              title={`${duplicateCount} unresolved possible duplicate${duplicateCount === 1 ? "" : "s"}: ${duplicateReasons}`}
                            >
                              Duplicate review
                            </Badge>
                          )}
                        </div>

                        {candidate.location && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {candidate.location}
                          </div>
                        )}

                        {candidate.matchReasons && (
                          <p className="line-clamp-3 text-sm text-muted-foreground">
                            {formatMatchReasons(candidate.matchReasons)}
                          </p>
                        )}

                        <div className="flex gap-2">
                          <Link
                            href={`/candidates/${candidate.id}`}
                            className="flex-1"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                            >
                              View Ledger
                            </Button>
                          </Link>
                          {candidate.profileUrl && (
                            <Button
                              variant="outline"
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
        <AlertDialog
          open={batchDismissDialogOpen}
          onOpenChange={open => {
            setBatchDismissDialogOpen(open);
            if (!open) setBatchDismissAcknowledged(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dismiss selected duplicate pairs?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark {selectedDuplicatePairs.length} selected pair
                {selectedDuplicatePairs.length === 1 ? "" : "s"} as not
                duplicates. The decision is written to the operating ledger and
                the raw matching identifiers remain hidden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Batch duplicate safeguard</p>
              <p>
                Use this only after reviewing the visible candidate summaries.
                Batch merging is intentionally unavailable because identity
                merges can affect outreach history.
              </p>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={batchDismissAcknowledged}
                  onCheckedChange={checked =>
                    setBatchDismissAcknowledged(checked === true)
                  }
                  data-testid="batch-duplicate-dismiss-ack"
                />
                <span>
                  I reviewed the selected duplicate queue pairs and confirmed
                  they should be dismissed as different people.
                </span>
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={resolveDuplicatePairsBatch.isPending}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={submitBatchDismiss}
                disabled={
                  resolveDuplicatePairsBatch.isPending ||
                  selectedDuplicatePairs.length === 0 ||
                  !batchDismissAcknowledged
                }
              >
                Dismiss {selectedDuplicatePairs.length}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

function DuplicateReviewExplanation({ explanation }: { explanation: any }) {
  const riskVariant =
    explanation.riskLevel === "high"
      ? "destructive"
      : explanation.riskLevel === "medium"
        ? "secondary"
        : "outline";

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <span className="font-medium">Review explanation</span>
            <Badge variant={riskVariant}>
              {explanation.riskLevel ?? "unknown"} signal
            </Badge>
          </div>
          <p className="mt-2 text-amber-900">{explanation.summary}</p>
        </div>
        <Badge variant="outline" className="w-fit bg-white text-left">
          {explanation.recommendedAction === "merge_if_same_person"
            ? "Merge after confirmation"
            : "Manual review"}
        </Badge>
      </div>
      {Array.isArray(explanation.whyShown) &&
        explanation.whyShown.length > 0 && (
          <div className="mt-3">
            <p className="font-medium">Why this pair is shown</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
              {explanation.whyShown.map((reason: string) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      {Array.isArray(explanation.falsePositiveSignals) &&
        explanation.falsePositiveSignals.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-white p-2">
            <p className="font-medium">False-positive checks</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-amber-900">
              {explanation.falsePositiveSignals.map((signal: string) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}

function DuplicateCandidateSummary({
  label,
  candidate,
}: {
  label: string;
  candidate: any;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted p-3 text-sm">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium">{candidate.name}</div>
      <div className="mt-1 text-muted-foreground">
        {candidate.campaign?.title || `Campaign #${candidate.campaignId}`}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant="secondary">
          {candidate.platform?.name || "Unknown platform"}
        </Badge>
        <Badge variant="outline">{candidate.compatibilityScore}%</Badge>
        {candidate.location && (
          <Badge variant="outline">{candidate.location}</Badge>
        )}
      </div>
    </div>
  );
}

function getQualificationState(
  candidate: any
): Exclude<QualificationFilter, "all"> {
  const decision = candidate.latestQualificationDecision?.decision;
  if (
    decision === "qualified" ||
    decision === "needs_review" ||
    decision === "not_qualified"
  ) {
    return decision;
  }
  return "awaiting_decision";
}

function getQualificationBadgeVariant(
  state: Exclude<QualificationFilter, "all">
): "default" | "secondary" | "destructive" | "outline" {
  if (state === "qualified") return "default";
  if (state === "needs_review") return "secondary";
  if (state === "not_qualified") return "destructive";
  return "outline";
}

function formatMatchReasons(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join("; ") : String(parsed);
  } catch {
    return value;
  }
}
