import DashboardLayout from "@/components/DashboardLayout";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  AlertTriangle,
  ClipboardCheck,
  ExternalLink,
  Fingerprint,
  MessageSquare,
  Send,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type QualificationDecision = "qualified" | "not_qualified" | "needs_review";

const priorityVariant: Record<string, "destructive" | "secondary" | "outline"> =
  {
    high: "destructive",
    medium: "secondary",
    low: "outline",
  };

const qualificationLabels: Record<QualificationDecision, string> = {
  qualified: "Qualified",
  not_qualified: "Not qualified",
  needs_review: "Needs review",
};

const terminalResponseLabels: Record<string, string> = {
  not_interested: "Not interested",
  unavailable: "Unavailable",
};

export default function CandidateDetail() {
  const [location] = useLocation();
  const candidateId = Number(location.split("/").filter(Boolean).pop());
  const invalidId = !Number.isFinite(candidateId);
  const [qualificationDecision, setQualificationDecision] =
    useState<QualificationDecision>("needs_review");
  const [qualificationReason, setQualificationReason] = useState("");
  const [qualificationAcknowledged, setQualificationAcknowledged] =
    useState(false);
  const utils = trpc.useUtils();
  const { data: ledger, isLoading } = trpc.candidates.getLedger.useQuery(
    { candidateId },
    { enabled: !invalidId }
  );
  const mergeDuplicate = trpc.candidates.mergeDuplicate.useMutation({
    onSuccess: () => {
      toast.success("Duplicate identity merged");
      utils.candidates.getLedger.invalidate({ candidateId });
      utils.candidates.getDuplicates.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const recordQualification = trpc.candidates.recordQualification.useMutation({
    onSuccess: () => {
      toast.success("Qualification decision recorded");
      setQualificationReason("");
      setQualificationAcknowledged(false);
      utils.candidates.getLedger.invalidate({ candidateId });
    },
    onError: error => toast.error(error.message),
  });
  const qualificationDisabled =
    recordQualification.isPending ||
    qualificationReason.trim().length < 8 ||
    (qualificationDecision === "qualified" && !qualificationAcknowledged);

  const shouldSuppressSafeUseAutoOpen =
    invalidId || isLoading || !!ledger?.outreachLock;
  const outreachLock = ledger?.outreachLock;
  const responseItems = ledger
    ? [
        ...ledger.responses,
        ...(outreachLock &&
        !ledger.responses.some(
          (response: any) => response.id === outreachLock.id
        )
          ? [
              {
                ...outreachLock,
                isIdentityOutreachLock: true,
              },
            ]
          : []),
      ]
    : [];

  return (
    <DashboardLayout
      suppressSafeUseOnboardingAutoOpen={shouldSuppressSafeUseAutoOpen}
    >
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/candidates">
              <Button variant="ghost" size="sm" className="mb-2 gap-2">
                <ArrowLeft className="h-4 w-4" />
                Candidates
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              {ledger?.candidate.name || "Candidate ledger"}
            </h1>
            <p className="text-gray-600 mt-1">
              Source identity, match explanation, messages, approvals, send
              attempts, replies, and follow-ups
            </p>
          </div>
          {ledger?.candidate && (
            <Badge variant="outline" className="mt-10">
              {ledger.candidate.compatibilityScore}% match
            </Badge>
          )}
        </div>

        {invalidId ? (
          <EmptyState
            title="Invalid candidate"
            description="The candidate URL does not contain a valid id."
          />
        ) : isLoading ? (
          <EmptyState
            title="Loading ledger..."
            description="Collecting operating state for this candidate."
          />
        ) : !ledger ? (
          <EmptyState
            title="Candidate not found"
            description="No ledger data is available for this candidate."
          />
        ) : (
          <>
            {ledger.outreachLock && (
              <Card
                className="border-red-200 bg-red-50"
                data-testid="candidate-outreach-lock"
              >
                <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-700" />
                    <div>
                      <div className="font-semibold text-red-950">
                        Outreach stopped for this candidate identity
                      </div>
                      <p className="mt-1 text-sm text-red-900">
                        {ledger.outreachLock.candidateId ===
                        ledger.candidate.id
                          ? "The latest response on this candidate says to stop or pause outreach."
                          : `A linked source profile (#${ledger.outreachLock.candidateId}) has a stop response, so approval, sending, bulk drafts, and follow-ups are blocked for this identity.`}
                      </p>
                    </div>
                  </div>
                  <div className="grid min-w-48 gap-2 text-sm text-red-950">
                    <Info
                      label="Response"
                      value={
                        terminalResponseLabels[
                          ledger.outreachLock.classification
                        ] || ledger.outreachLock.classification
                      }
                    />
                    <Info
                      label="Received"
                      value={formatDate(ledger.outreachLock.receivedAt)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-blue-600" />
                    Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Info label="Campaign" value={ledger.campaign.title} />
                    <Info
                      label="Platform"
                      value={
                        ledger.platform?.name ||
                        `Platform #${ledger.candidate.platformId}`
                      }
                    />
                    <Info
                      label="Location"
                      value={ledger.candidate.location || "Not recorded"}
                    />
                    <Info label="Status" value={ledger.candidate.status} />
                  </div>
                  {ledger.candidate.profileUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() =>
                        window.open(
                          ledger.candidate.profileUrl!,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open source profile
                    </Button>
                  )}
                  {ledger.candidate.matchReasons && (
                    <div>
                      <div className="mb-2 text-sm font-medium">
                        Match reasoning
                      </div>
                      <div className="rounded-md bg-muted p-3 text-sm">
                        {formatMatchReasons(ledger.candidate.matchReasons)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Fingerprint className="h-5 w-5 text-emerald-600" />
                    Identity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Info
                    label="Canonical name"
                    value={
                      ledger.identity?.canonicalName || ledger.candidate.name
                    }
                  />
                  <Info label="Sources" value={String(ledger.sources.length)} />
                  <Info
                    label="Primary external id"
                    value={ledger.source?.externalId || "Not recorded"}
                  />
                  {ledger.sources.length > 1 && (
                    <Badge variant="secondary">
                      Duplicate review recommended
                    </Badge>
                  )}
                  {ledger.duplicateCandidates.length > 0 && (
                    <Badge variant="secondary">
                      {ledger.duplicateCandidates.length} possible duplicate
                      {ledger.duplicateCandidates.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {ledger.duplicateCandidates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Fingerprint className="h-5 w-5 text-amber-600" />
                    Duplicate Review
                  </CardTitle>
                </CardHeader>
                <CardContent
                  className="grid gap-3 md:grid-cols-2"
                  data-testid="duplicate-review"
                >
                  {ledger.duplicateCandidates.map((duplicate: any) => (
                    <div
                      key={duplicate.candidate.id}
                      className="rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">
                            {duplicate.candidate.name}
                          </div>
                          <div className="text-muted-foreground">
                            {duplicate.candidate.campaign?.title ||
                              `Campaign #${duplicate.candidate.campaignId}`}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {duplicate.confidence}% match
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {duplicate.reasons.join(", ")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/candidates/${duplicate.candidate.id}`}>
                          <Button variant="outline" size="sm">
                            Open profile
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          data-testid={`merge-duplicate-${duplicate.candidate.id}`}
                          onClick={() =>
                            mergeDuplicate.mutate({
                              targetCandidateId: ledger.candidate.id,
                              sourceCandidateId: duplicate.candidate.id,
                              reason: `Merged from candidate ledger: ${duplicate.reasons.join(", ")}`,
                            })
                          }
                          disabled={mergeDuplicate.isPending}
                        >
                          Merge identity
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" />
                  Next Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {ledger.nextActions.map((action: any, index: number) => (
                  <div
                    key={`${action.label}-${index}`}
                    className="rounded-md border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">{action.label}</div>
                      <Badge
                        variant={priorityVariant[action.priority] || "outline"}
                      >
                        {action.priority}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {action.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-emerald-600" />
                  Qualification Decision
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ledger.latestQualificationDecision ? (
                  <div
                    className="rounded-md border p-3 text-sm"
                    data-testid="candidate-qualification-latest"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">
                        {
                          qualificationLabels[
                            ledger.latestQualificationDecision
                              .decision as QualificationDecision
                          ]
                        }
                      </div>
                      <Badge variant="outline">
                        {formatDate(
                          ledger.latestQualificationDecision.createdAt
                        )}
                      </Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {ledger.latestQualificationDecision.reason}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No qualification decision recorded.
                  </p>
                )}

                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {(
                    [
                      "qualified",
                      "not_qualified",
                      "needs_review",
                    ] as QualificationDecision[]
                  ).map(decision => (
                    <label
                      key={decision}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                        qualificationDecision === decision
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background hover:bg-accent"
                      }
                      `}
                    >
                      <input
                        type="radio"
                        name="qualificationDecision"
                        value={decision}
                        checked={qualificationDecision === decision}
                        onChange={() => setQualificationDecision(decision)}
                        className="h-4 w-4 accent-primary"
                        data-testid={`candidate-qualification-${decision}`}
                      />
                      <span>{qualificationLabels[decision]}</span>
                    </label>
                  ))}
                </div>

                <Textarea
                  value={qualificationReason}
                  onChange={event =>
                    setQualificationReason(event.currentTarget.value)
                  }
                  placeholder="Relevant campaign evidence for this decision"
                  data-testid="candidate-qualification-reason"
                  className="min-h-24"
                />

                {qualificationDecision === "qualified" && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={qualificationAcknowledged}
                      onCheckedChange={checked =>
                        setQualificationAcknowledged(checked === true)
                      }
                      data-testid="candidate-qualification-ack"
                    />
                    <span>
                      I confirm this is based on relevant campaign evidence, not
                      sensitive or protected assumptions.
                    </span>
                  </label>
                )}

                <Button
                  type="button"
                  data-testid="candidate-qualification-submit"
                  disabled={qualificationDisabled}
                  onClick={() =>
                    recordQualification.mutate({
                      candidateId: ledger.candidate.id,
                      decision: qualificationDecision,
                      reason: qualificationReason,
                      sensitiveAssumptionsAcknowledged:
                        qualificationAcknowledged,
                    })
                  }
                >
                  {recordQualification.isPending
                    ? "Recording..."
                    : "Record decision"}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <LedgerList
                icon={<MessageSquare className="h-5 w-5 text-blue-600" />}
                title="Messages"
                items={ledger.messages}
                empty="No message drafts recorded."
                renderItem={(message: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">
                        {message.subject || "Untitled message"}
                      </div>
                      <Badge variant="outline">{message.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {message.content}
                    </p>
                  </div>
                )}
              />
              <LedgerList
                icon={<Send className="h-5 w-5 text-emerald-600" />}
                title="Send Attempts"
                items={ledger.sendAttempts}
                empty="No send attempts recorded."
                renderItem={(attempt: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">Attempt #{attempt.id}</div>
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

            <div className="grid gap-4 xl:grid-cols-2">
              <LedgerList
                icon={<MessageSquare className="h-5 w-5 text-indigo-600" />}
                title="Responses"
                items={responseItems}
                empty="No candidate or linked identity responses recorded."
                renderItem={(response: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {terminalResponseLabels[response.classification] ||
                            response.classification}
                        </div>
                        {response.isIdentityOutreachLock && (
                          <div className="mt-1 text-xs text-red-700">
                            {`Linked source profile #${response.candidateId} stopped outreach for this identity.`}
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={
                          response.isIdentityOutreachLock
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {response.isIdentityOutreachLock
                          ? "identity stop"
                          : `${response.confidence}%`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {response.normalizedContent || response.rawContent}
                    </p>
                  </div>
                )}
              />
              <LedgerList
                icon={<ClipboardCheck className="h-5 w-5 text-amber-600" />}
                title="Follow-ups"
                items={ledger.followUps}
                empty="No follow-up records for this candidate."
                renderItem={(followUp: any) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-medium">
                        {followUp.subject || `Follow-up #${followUp.id}`}
                      </div>
                      <Badge variant="outline">{followUp.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Due {formatDate(followUp.scheduledAt)}
                    </p>
                  </div>
                )}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Match Factors And Audit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ledger.matchFactors.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {ledger.matchFactors.map((factor: any) => (
                      <div
                        key={factor.id}
                        className="rounded-md border p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {factor.factorType}
                          </span>
                          <span>{factor.score}%</span>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {factor.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
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
                    No candidate audit events recorded.
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
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

function formatMatchReasons(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join("; ") : String(parsed);
  } catch {
    return value;
  }
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "not scheduled" : date.toLocaleString();
}
