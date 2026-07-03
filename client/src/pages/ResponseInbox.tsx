import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  getInitialPositiveIntegerSearchParam,
  getInitialSearchParam,
} from "@/lib/urlFilters";
import {
  AlertTriangle,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  Inbox,
  MessageSquare,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

const classificationLabels: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not interested",
  more_info: "Needs info",
  unavailable: "Unavailable",
  no_response: "No response",
  unknown: "Unknown",
};

const classificationStyles: Record<string, string> = {
  interested: "border-green-300 bg-green-50 text-green-800",
  not_interested: "border-red-300 bg-red-50 text-red-800",
  more_info: "border-blue-300 bg-blue-50 text-blue-800",
  unavailable: "border-amber-300 bg-amber-50 text-amber-800",
  no_response: "border-slate-300 bg-slate-50 text-slate-800",
  unknown: "border-gray-300 bg-gray-50 text-gray-800",
};

const classificationOptions = [
  "interested",
  "more_info",
  "not_interested",
  "unavailable",
  "no_response",
  "unknown",
] as const;

export default function ResponseInbox() {
  const utils = trpc.useUtils();
  const [classificationFilter, setClassificationFilter] = useState<string>(() =>
    getInitialSearchParam(
      "classification",
      ["all", ...classificationOptions] as const,
      "all"
    )
  );
  const [campaignFilter, setCampaignFilter] = useState(() =>
    getInitialPositiveIntegerSearchParam("campaignId")
  );
  const [resultLimit, setResultLimit] = useState<string>(() =>
    getInitialSearchParam("limit", ["25", "50", "100"] as const, "50")
  );
  const responseQueryInput = {
    classification:
      classificationFilter === "all"
        ? undefined
        : (classificationFilter as (typeof classificationOptions)[number]),
    campaignId: campaignFilter === "all" ? undefined : Number(campaignFilter),
    limit: Number(resultLimit),
  };
  const { data: responses, isLoading } =
    trpc.responses.list.useQuery(responseQueryInput);
  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const [followUpResponse, setFollowUpResponse] = useState<any>(null);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [responseCandidateId, setResponseCandidateId] = useState("");
  const [responseContent, setResponseContent] = useState("");
  const [responseClassification, setResponseClassification] = useState("auto");
  const [responseConfidence, setResponseConfidence] = useState("");
  const [responseSource, setResponseSource] = useState<
    "manual" | "platform" | "import"
  >("manual");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [updatingResponseId, setUpdatingResponseId] = useState<number | null>(
    null
  );
  const candidatePickerQuery = trpc.candidates.searchForPicker.useQuery(
    {
      search: candidateSearch.trim() || undefined,
      campaignId: campaignFilter === "all" ? undefined : Number(campaignFilter),
      limit: 25,
    },
    { enabled: recordDialogOpen }
  );

  const prepareFollowUp = trpc.followUps.prepare.useMutation({
    onSuccess: () => {
      toast.success("Follow-up draft queued for review");
      resetFollowUpDialog();
      utils.followUps.getDue.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateClassification = trpc.responses.updateClassification.useMutation({
    onSuccess: result => {
      toast.success("Response classification updated");
      if (result.cancelledFollowUpIds.length > 0) {
        toast.info("Active follow-ups were cancelled for this candidate");
      }
      utils.responses.list.invalidate();
      utils.followUps.getDue.invalidate();
      utils.messages.listAll.invalidate();
    },
    onError: error => toast.error(error.message),
    onSettled: () => setUpdatingResponseId(null),
  });
  const recordCandidateResponse =
    trpc.responses.recordCandidateResponse.useMutation({
      onSuccess: result => {
        toast.success(
          `Response recorded as ${classificationLabels[result.classification] || result.classification}`
        );
        if (result.cancelledFollowUpIds.length > 0) {
          toast.info("Active follow-ups were cancelled for this candidate");
        }
        resetRecordDialog();
        utils.responses.list.invalidate();
        utils.followUps.getDue.invalidate();
        utils.messages.listAll.invalidate();
        utils.candidates.getLedger.invalidate();
      },
      onError: error => toast.error(error.message),
    });

  const resetFollowUpDialog = () => {
    setFollowUpResponse(null);
    setDraftSubject("");
    setDraftContent("");
    setScheduledAt("");
  };

  const openFollowUpDialog = (response: any) => {
    const draft = buildFollowUpDraft(response);
    setFollowUpResponse(response);
    setDraftSubject(draft.subject);
    setDraftContent(draft.content);
    setScheduledAt(toLocalDateTimeInputValue(new Date()));
  };

  const resetRecordDialog = () => {
    setRecordDialogOpen(false);
    setCandidateSearch("");
    setResponseCandidateId("");
    setResponseContent("");
    setResponseClassification("auto");
    setResponseConfidence("");
    setResponseSource("manual");
  };

  const handleRecordCandidateResponse = () => {
    const candidateId = Number(responseCandidateId);
    const rawContent = responseContent.trim();
    const confidenceText = responseConfidence.trim();
    const confidence =
      confidenceText === "" ? undefined : Number(confidenceText);

    if (!Number.isInteger(candidateId) || candidateId <= 0) {
      toast.error("Select the candidate who replied");
      return;
    }

    if (!rawContent) {
      toast.error("Record the candidate reply text");
      return;
    }

    if (
      confidence !== undefined &&
      (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)
    ) {
      toast.error("Confidence must be between 0 and 100");
      return;
    }

    recordCandidateResponse.mutate({
      candidateId,
      rawContent,
      classification:
        responseClassification === "auto"
          ? undefined
          : (responseClassification as
              | "interested"
              | "not_interested"
              | "more_info"
              | "unavailable"
              | "no_response"
              | "unknown"),
      confidence,
      source: responseSource,
    });
  };

  const handlePrepareFollowUp = () => {
    if (!followUpResponse?.candidateId) return;

    const subject = draftSubject.trim();
    const content = draftContent.trim();

    if (!subject || !content) {
      toast.error("Follow-up subject and content are required");
      return;
    }

    prepareFollowUp.mutate({
      candidateId: followUpResponse.candidateId,
      subject,
      content,
      scheduledAt: scheduledAt
        ? new Date(scheduledAt).toISOString()
        : undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Response Inbox</h1>
          <p className="text-gray-600 mt-1">
            Review candidate replies, classifications, and next action context
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid w-full gap-3 md:w-auto md:grid-cols-3">
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger data-testid="response-campaign-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {(campaigns || []).map((campaign: any) => (
                    <SelectItem key={campaign.id} value={String(campaign.id)}>
                      {campaign.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Classification</Label>
              <Select
                value={classificationFilter}
                onValueChange={setClassificationFilter}
              >
                <SelectTrigger data-testid="response-classification-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All replies</SelectItem>
                  {classificationOptions.map(classification => (
                    <SelectItem key={classification} value={classification}>
                      {classificationLabels[classification]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rows</Label>
              <Select value={resultLimit} onValueChange={setResultLimit}>
                <SelectTrigger data-testid="response-limit-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 latest</SelectItem>
                  <SelectItem value="50">50 latest</SelectItem>
                  <SelectItem value="100">100 latest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => setRecordDialogOpen(true)}
            data-testid="open-record-candidate-response"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Record response
          </Button>
        </div>
        {responses && responses.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing {responses.length} latest matching response
            {responses.length === 1 ? "" : "s"}.
          </p>
        )}

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading responses...
            </CardContent>
          </Card>
        ) : !responses || responses.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No responses recorded
              </h3>
              <p className="text-gray-600">
                No replies match the current inbox filters.
              </p>
              <Button
                className="mt-4"
                onClick={() => setRecordDialogOpen(true)}
              >
                Record first response
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {responses.map((response: any) => {
              const nextAction = getNextAction(response.classification);
              const canPrepareFollowUp = nextAction.prepareFollowUp;

              return (
                <Card key={response.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <User className="h-5 w-5 text-blue-600" />
                          {response.candidate?.name || "Unknown candidate"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {response.campaign?.title || "Unknown campaign"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          classificationStyles[response.classification] ||
                          classificationStyles.unknown
                        }
                      >
                        {classificationLabels[response.classification] ||
                          response.classification}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">
                      {response.normalizedContent || response.rawContent}
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        {nextAction.level === "positive" ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                        ) : nextAction.level === "stop" ? (
                          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                        ) : (
                          <ArrowRight className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                        )}
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            {nextAction.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {nextAction.detail}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">Classification</p>
                          <p className="text-sm text-muted-foreground">
                            Correct ambiguous replies before approving any
                            follow-up.
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            classificationStyles[response.classification] ||
                            classificationStyles.unknown
                          }
                        >
                          {classificationLabels[response.classification] ||
                            response.classification}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {classificationOptions.map(classification => (
                          <Button
                            key={classification}
                            size="sm"
                            variant={
                              response.classification === classification
                                ? "default"
                                : "outline"
                            }
                            disabled={
                              response.classification === classification ||
                              updateClassification.isPending
                            }
                            onClick={() => {
                              setUpdatingResponseId(response.id);
                              updateClassification.mutate({
                                responseId: response.id,
                                classification,
                                reason: "Manual inbox classification review",
                              });
                            }}
                            data-testid={`classify-response-${response.id}-${classification}`}
                          >
                            {updatingResponseId === response.id &&
                            updateClassification.isPending
                              ? "Updating..."
                              : classificationLabels[classification]}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span>Confidence: {response.confidence}%</span>
                      <span>Source: {response.source}</span>
                      <span>
                        Received:{" "}
                        {new Date(response.receivedAt).toLocaleString()}
                      </span>
                      {response.message?.subject && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-4 w-4" />
                          {response.message.subject}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                      <div className="flex gap-2">
                        {response.candidate?.id && (
                          <Link href={`/candidates/${response.candidate.id}`}>
                            <Button variant="outline" size="sm">
                              <User className="mr-2 h-4 w-4" />
                              Candidate
                            </Button>
                          </Link>
                        )}
                        {response.campaign?.id && (
                          <Link href={`/campaigns/${response.campaign.id}`}>
                            <Button variant="outline" size="sm">
                              <MessageSquare className="mr-2 h-4 w-4" />
                              Campaign
                            </Button>
                          </Link>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={canPrepareFollowUp ? "default" : "outline"}
                        onClick={() => openFollowUpDialog(response)}
                        disabled={!canPrepareFollowUp}
                        data-testid={`prepare-follow-up-${response.id}`}
                      >
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        Prepare follow-up
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog
          open={!!followUpResponse}
          onOpenChange={open => {
            if (!open) resetFollowUpDialog();
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Prepare follow-up draft</DialogTitle>
              <DialogDescription>
                Queue a follow-up draft for review. This does not send or
                approve an external message.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="font-medium">
                  {followUpResponse?.candidate?.name || "Unknown candidate"}
                </div>
                <div className="text-muted-foreground">
                  {classificationLabels[followUpResponse?.classification] ||
                    followUpResponse?.classification}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="followUpSubject">Subject</Label>
                <Input
                  id="followUpSubject"
                  value={draftSubject}
                  onChange={event => setDraftSubject(event.target.value)}
                  data-testid="follow-up-subject"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="followUpContent">Draft</Label>
                <Textarea
                  id="followUpContent"
                  value={draftContent}
                  onChange={event => setDraftContent(event.target.value)}
                  rows={9}
                  data-testid="follow-up-content"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="followUpScheduledAt">Review time</Label>
                <Input
                  id="followUpScheduledAt"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={event => setScheduledAt(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetFollowUpDialog}
                disabled={prepareFollowUp.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handlePrepareFollowUp}
                disabled={prepareFollowUp.isPending}
                data-testid="follow-up-submit"
              >
                {prepareFollowUp.isPending ? "Preparing..." : "Queue Draft"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={recordDialogOpen}
          onOpenChange={open => {
            if (!open) resetRecordDialog();
            else setRecordDialogOpen(true);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record candidate response</DialogTitle>
              <DialogDescription>
                Log a reply received outside the tool. It is classified, added
                to this inbox, and can stop unsafe follow-ups.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="candidateResponseSearch">
                  Search candidate
                </Label>
                <Input
                  id="candidateResponseSearch"
                  value={candidateSearch}
                  onChange={event => setCandidateSearch(event.target.value)}
                  placeholder="Name, email, location, or profile URL"
                  data-testid="candidate-response-search"
                />
              </div>

              <div className="space-y-2">
                <Label>Candidate</Label>
                <Select
                  value={responseCandidateId}
                  onValueChange={setResponseCandidateId}
                >
                  <SelectTrigger data-testid="candidate-response-candidate">
                    <SelectValue placeholder="Select candidate" />
                  </SelectTrigger>
                  <SelectContent>
                    {(candidatePickerQuery.data || []).map((candidate: any) => (
                      <SelectItem
                        key={candidate.id}
                        value={String(candidate.id)}
                      >
                        {candidate.name} -{" "}
                        {candidate.campaign?.title ||
                          `Campaign #${candidate.campaignId}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Showing up to 25 matching candidates
                  {campaignFilter === "all"
                    ? "."
                    : " from the selected campaign."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="candidateResponseContent">Reply text</Label>
                <Textarea
                  id="candidateResponseContent"
                  value={responseContent}
                  onChange={event => setResponseContent(event.target.value)}
                  rows={6}
                  placeholder="Paste or summarize the candidate reply here."
                  data-testid="candidate-response-content"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Classification</Label>
                  <Select
                    value={responseClassification}
                    onValueChange={setResponseClassification}
                  >
                    <SelectTrigger data-testid="candidate-response-classification">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto classify</SelectItem>
                      {classificationOptions.map(classification => (
                        <SelectItem key={classification} value={classification}>
                          {classificationLabels[classification]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidateResponseConfidence">
                    Confidence
                  </Label>
                  <Input
                    id="candidateResponseConfidence"
                    type="number"
                    min="0"
                    max="100"
                    value={responseConfidence}
                    onChange={event =>
                      setResponseConfidence(event.target.value)
                    }
                    placeholder="Auto"
                    data-testid="candidate-response-confidence"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select
                    value={responseSource}
                    onValueChange={value =>
                      setResponseSource(
                        value as "manual" | "platform" | "import"
                      )
                    }
                  >
                    <SelectTrigger data-testid="candidate-response-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="platform">Platform</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={resetRecordDialog}
                disabled={recordCandidateResponse.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordCandidateResponse}
                disabled={recordCandidateResponse.isPending}
                data-testid="record-candidate-response-submit"
              >
                {recordCandidateResponse.isPending
                  ? "Recording..."
                  : "Record Response"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

function getNextAction(classification: string) {
  switch (classification) {
    case "interested":
      return {
        level: "positive",
        title: "Propose a concrete next step",
        detail:
          "Prepare a short reply asking for availability and a first introduction moment.",
        prepareFollowUp: true,
      };
    case "more_info":
      return {
        level: "positive",
        title: "Send more context",
        detail:
          "Prepare a concise follow-up with practical details and one clear question.",
        prepareFollowUp: true,
      };
    case "no_response":
      return {
        level: "neutral",
        title: "Send one gentle follow-up",
        detail:
          "Prepare a polite reminder and keep the message review-gated before delivery.",
        prepareFollowUp: true,
      };
    case "not_interested":
      return {
        level: "stop",
        title: "Stop outreach",
        detail:
          "Do not prepare another message unless Robert explicitly reopens this candidate.",
        prepareFollowUp: false,
      };
    case "unavailable":
      return {
        level: "stop",
        title: "Pause this candidate",
        detail:
          "No follow-up is recommended unless the candidate gave a future availability window.",
        prepareFollowUp: false,
      };
    default:
      return {
        level: "neutral",
        title: "Review manually",
        detail:
          "Classification is uncertain. Prepare a clarification draft only after checking the candidate context.",
        prepareFollowUp: true,
      };
  }
}

function buildFollowUpDraft(response: any) {
  const candidateName = response.candidate?.name || "kandidaat";
  const greeting = `Beste ${candidateName},`;

  switch (response.classification) {
    case "interested":
      return {
        subject: "Vervolg op uw reactie",
        content: `${greeting}\n\nDank u wel voor uw reactie. Fijn om te horen dat u interesse heeft. Zou u kunnen aangeven wanneer u beschikbaar bent voor een korte kennismaking en welke ondersteuning u graag zou bespreken?\n\nMet vriendelijke groet,\nRobert`,
      };
    case "more_info":
      return {
        subject: "Meer informatie over de hulpvraag",
        content: `${greeting}\n\nDank u wel voor uw reactie. Ik stuur u graag wat meer context. Het gaat om passende ondersteuning waarbij betrouwbaarheid, duidelijke afspraken en een goede klik belangrijk zijn.\n\nWelke informatie heeft u nog nodig om te bepalen of dit bij u past?\n\nMet vriendelijke groet,\nRobert`,
      };
    case "no_response":
      return {
        subject: "Korte opvolging",
        content: `${greeting}\n\nIk wilde mijn eerdere bericht kort opvolgen. Als het niet past, is dat uiteraard geen probleem. Als u wel openstaat voor een korte kennismaking, hoor ik graag wat voor u een goed moment is.\n\nMet vriendelijke groet,\nRobert`,
      };
    default:
      return {
        subject: "Vervolg op uw bericht",
        content: `${greeting}\n\nDank u wel voor uw reactie. Ik wil graag zeker weten dat ik uw bericht goed begrijp. Zou u kort kunnen aangeven wat voor u een passende vervolgstap zou zijn?\n\nMet vriendelijke groet,\nRobert`,
      };
  }
}

function toLocalDateTimeInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
