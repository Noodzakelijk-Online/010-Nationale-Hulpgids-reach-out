import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { trpc } from "@/lib/trpc";
import {
  getInitialPositiveIntegerSearchParam,
  getInitialSearchParam,
} from "@/lib/urlFilters";
import {
  MessageSquare,
  Check,
  X,
  Edit,
  Send,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  User,
  Building,
  AlertTriangle,
  ClipboardCheck,
  LockOpen,
} from "lucide-react";
import { toast } from "sonner";

const terminalResponseLabels: Record<string, string> = {
  not_interested: "Not interested",
  unavailable: "Unavailable",
};

const BULK_APPROVAL_REVIEW_THRESHOLD = 10;
const MIN_CONFIRMATION_TEXT_LENGTH = 20;
const MIN_EXTERNAL_MESSAGE_ID_LENGTH = 6;
const MIN_SEND_FAILURE_REASON_LENGTH = 8;
const MESSAGE_PAGE_SIZE = 50;
const sensitiveMessagePattern =
  /\b(bsn|medicatie|diagnose|ziekte|psychisch|trauma|verslaving|persoonlijke verzorging|intiem|toilet|dementie|autisme|adhd|ptss|depressie|angst|beperking|behandeling|therapie)\b/i;
const messageStatusFilters = [
  "all",
  "queued",
  "approved",
  "sent",
  "failed",
  "replied",
  "rejected",
] as const;

function getTerminalResponse(message: any) {
  const response = message.latestCandidateResponse;
  if (!response || !(response.classification in terminalResponseLabels)) {
    return null;
  }
  return response;
}

function isMessageOutreachLocked(message: any) {
  return !!getTerminalResponse(message);
}

function hasSensitiveMessageContent(message: any) {
  return sensitiveMessagePattern.test(
    `${message.subject || ""}\n${message.content || ""}`
  );
}

function isDryRunMessage(message: any) {
  const searchCriteria = message.campaign?.searchCriteria;
  if (typeof searchCriteria !== "string") return false;
  try {
    return JSON.parse(searchCriteria)?.operationMode === "dry_run";
  } catch {
    return false;
  }
}

function isArchivedMessage(message: any) {
  return message.campaign?.status === "archived";
}

export default function Messages() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    getInitialSearchParam("status", messageStatusFilters, "all")
  );
  const [campaignFilter, setCampaignFilter] = useState<string>(() =>
    getInitialPositiveIntegerSearchParam("campaignId")
  );
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<any>(null);
  const [deliveryStatus, setDeliveryStatus] = useState<"succeeded" | "failed">(
    "succeeded"
  );
  const [confirmationText, setConfirmationText] = useState("");
  const [externalMessageId, setExternalMessageId] = useState("");
  const [sendErrorMessage, setSendErrorMessage] = useState("");
  const [responseMessage, setResponseMessage] = useState<any>(null);
  const [responseContent, setResponseContent] = useState("");
  const [responseClassification, setResponseClassification] = useState("auto");
  const [responseConfidence, setResponseConfidence] = useState("");
  const [responseSource, setResponseSource] = useState<
    "manual" | "platform" | "import"
  >("manual");
  const [reopenMessage, setReopenMessage] = useState<any>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [bulkComplianceAcknowledged, setBulkComplianceAcknowledged] =
    useState(false);
  const [bulkSafetyAcknowledged, setBulkSafetyAcknowledged] = useState(false);
  const [bulkSensitiveAcknowledged, setBulkSensitiveAcknowledged] =
    useState(false);
  const [sensitiveApprovalMessage, setSensitiveApprovalMessage] =
    useState<any>(null);
  const [sensitiveApprovalAcknowledged, setSensitiveApprovalAcknowledged] =
    useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  // Fetch all campaigns for filter dropdown
  const { data: campaigns } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Keep the review queue bounded so a long campaign history does not stall the UI.
  const {
    data: messagePage,
    isLoading,
    refetch,
  } = trpc.messages.listPage.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      campaignId:
        campaignFilter === "all" ? undefined : parseInt(campaignFilter),
      limit: MESSAGE_PAGE_SIZE,
      offset: currentPage * MESSAGE_PAGE_SIZE,
    },
    {
      enabled: !!user,
    }
  );
  const messages = messagePage?.items ?? [];
  const messageCounts = messagePage?.statusCounts ?? {};
  const totalMessages = messagePage?.total ?? 0;

  const approveMessage = trpc.messages.approve.useMutation({
    onSuccess: () => {
      toast.success("Message approved");
      setSensitiveApprovalMessage(null);
      setSensitiveApprovalAcknowledged(false);
      refetch();
    },
    onError: error => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const rejectMessage = trpc.messages.reject.useMutation({
    onSuccess: () => {
      toast.success("Message rejected");
      refetch();
    },
    onError: error => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

  const updateMessage = trpc.messages.update.useMutation({
    onSuccess: () => {
      toast.success("Message updated successfully");
      setEditingMessage(null);
      refetch();
    },
    onError: error => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const bulkApprove = trpc.messages.bulkUpdateStatus.useMutation({
    onSuccess: result => {
      toast.success(`${result.updated} messages approved`);
      setBulkApproveDialogOpen(false);
      setBulkComplianceAcknowledged(false);
      setBulkSafetyAcknowledged(false);
      setBulkSensitiveAcknowledged(false);
      refetch();
    },
    onError: error => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const recordSendAttempt = trpc.messages.recordSendAttempt.useMutation({
    onSuccess: () => {
      toast.success(
        deliveryStatus === "succeeded"
          ? "Delivery evidence recorded"
          : "Send failure recorded"
      );
      setDeliveryMessage(null);
      setConfirmationText("");
      setExternalMessageId("");
      setSendErrorMessage("");
      setDeliveryStatus("succeeded");
      refetch();
    },
    onError: error => {
      toast.error(`Failed to record send attempt: ${error.message}`);
    },
  });

  const recordResponse = trpc.messages.recordResponse.useMutation({
    onSuccess: result => {
      const label =
        result.classification === "not_interested"
          ? "not interested"
          : result.classification.replace("_", " ");
      toast.success(`Response recorded as ${label}`);
      setResponseMessage(null);
      setResponseContent("");
      setResponseClassification("auto");
      setResponseConfidence("");
      setResponseSource("manual");
      refetch();
    },
    onError: error => {
      toast.error(`Failed to record response: ${error.message}`);
    },
  });

  const reopenOutreach = trpc.messages.reopenOutreach.useMutation({
    onSuccess: () => {
      toast.success("Candidate outreach reopened");
      setReopenMessage(null);
      setReopenReason("");
      refetch();
    },
    onError: error => {
      toast.error(`Failed to reopen outreach: ${error.message}`);
    },
  });

  const handleApprove = (message: any) => {
    if (hasSensitiveMessageContent(message)) {
      setSensitiveApprovalMessage(message);
      setSensitiveApprovalAcknowledged(false);
      return;
    }
    approveMessage.mutate({ messageId: message.id });
  };

  const handleSensitiveApproval = () => {
    if (!sensitiveApprovalMessage) return;
    approveMessage.mutate({
      messageId: sensitiveApprovalMessage.id,
      sensitiveContentAcknowledged: sensitiveApprovalAcknowledged,
      reason: "Sensitive care or personal context reviewed",
    });
  };

  const handleReject = (messageId: number) => {
    rejectMessage.mutate({ messageId });
  };

  const handleEdit = (message: any) => {
    setEditingMessage(message);
    setEditedSubject(message.subject);
    setEditedContent(message.content);
  };

  const handleSaveEdit = () => {
    if (!editingMessage) return;
    updateMessage.mutate({
      messageId: editingMessage.id,
      subject: editedSubject,
      content: editedContent,
    });
  };

  const handleOpenDeliveryDialog = (message: any) => {
    setDeliveryMessage(message);
    setDeliveryStatus("succeeded");
    setConfirmationText("");
    setExternalMessageId("");
    setSendErrorMessage("");
  };

  const handleRecordSendAttempt = () => {
    if (!deliveryMessage) return;

    const trimmedConfirmation = confirmationText.trim();
    const trimmedExternalId = externalMessageId.trim();
    const trimmedError = sendErrorMessage.trim();

    if (deliveryStatus === "succeeded") {
      const hasUsefulConfirmation =
        trimmedConfirmation.length >= MIN_CONFIRMATION_TEXT_LENGTH;
      const hasUsefulExternalId =
        trimmedExternalId.length >= MIN_EXTERNAL_MESSAGE_ID_LENGTH;

      if (!hasUsefulConfirmation && !hasUsefulExternalId) {
        toast.error(
          "Record platform confirmation text of at least 20 characters or an external message id/URL of at least 6 characters"
        );
        return;
      }
    }

    if (
      deliveryStatus === "failed" &&
      trimmedError.length < MIN_SEND_FAILURE_REASON_LENGTH
    ) {
      toast.error("Record a failure reason of at least 8 characters");
      return;
    }

    recordSendAttempt.mutate({
      messageId: deliveryMessage.id,
      status: deliveryStatus,
      confirmationText:
        deliveryStatus === "succeeded" && trimmedConfirmation
          ? trimmedConfirmation
          : undefined,
      externalMessageId:
        deliveryStatus === "succeeded" && trimmedExternalId
          ? trimmedExternalId
          : undefined,
      errorMessage: deliveryStatus === "failed" ? trimmedError : undefined,
    });
  };

  const handleOpenResponseDialog = (message: any) => {
    setResponseMessage(message);
    setResponseContent("");
    setResponseClassification("auto");
    setResponseConfidence("");
    setResponseSource("manual");
  };

  const handleOpenReopenDialog = (message: any) => {
    setReopenMessage(message);
    setReopenReason("");
  };

  const handleReopenOutreach = () => {
    if (!reopenMessage) return;
    const trimmedReason = reopenReason.trim();
    if (trimmedReason.length < 8) {
      toast.error("Explain why outreach can safely be reopened");
      return;
    }

    reopenOutreach.mutate({
      messageId: reopenMessage.id,
      reason: trimmedReason,
    });
  };

  const handleRecordResponse = () => {
    if (!responseMessage) return;

    const trimmedContent = responseContent.trim();
    const trimmedConfidence = responseConfidence.trim();
    const parsedConfidence =
      trimmedConfidence === "" ? undefined : Number(trimmedConfidence);

    if (!trimmedContent) {
      toast.error("Record the candidate reply text");
      return;
    }

    if (
      parsedConfidence !== undefined &&
      (!Number.isFinite(parsedConfidence) ||
        parsedConfidence < 0 ||
        parsedConfidence > 100)
    ) {
      toast.error("Confidence must be between 0 and 100");
      return;
    }

    recordResponse.mutate({
      messageId: responseMessage.id,
      rawContent: trimmedContent,
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
      confidence: parsedConfidence,
      source: responseSource,
    });
  };

  const handleBulkApprove = () => {
    const queuedMessages =
      messages?.filter(
        message =>
          message.status === "queued" &&
          !isMessageOutreachLocked(message) &&
          !isDryRunMessage(message) &&
          !isArchivedMessage(message)
      ) || [];
    const queuedMessageIds = queuedMessages.map(message => message.id);

    if (queuedMessageIds.length === 0) {
      toast.error("No safe queued messages to approve");
      return;
    }

    bulkApprove.mutate({
      messageIds: queuedMessageIds,
      status: "approved",
      complianceAcknowledged: bulkComplianceAcknowledged,
      safetyAcknowledged: bulkSafetyAcknowledged,
      sensitiveContentAcknowledged: bulkSensitiveAcknowledged,
    });
  };

  const handleBulkApproveDialogOpenChange = (open: boolean) => {
    setBulkApproveDialogOpen(open);
    if (!open) {
      setBulkComplianceAcknowledged(false);
      setBulkSafetyAcknowledged(false);
      setBulkSensitiveAcknowledged(false);
    }
  };

  const getMessageWarnings = (message: any) => {
    const warnings: string[] = [];
    const terminalResponse = getTerminalResponse(message);

    if (terminalResponse) {
      warnings.push(
        `Outreach stopped: ${terminalResponseLabels[terminalResponse.classification]}`
      );
    }

    if (isDryRunMessage(message)) {
      warnings.push("Dry-run campaign: approval and delivery are blocked");
    }

    if (isArchivedMessage(message)) {
      warnings.push("Archived campaign: outreach actions are blocked");
    }

    if (!message.candidate?.name) {
      warnings.push("Missing candidate name");
    }

    if ((message.subject || "").length > 90) {
      warnings.push("Long subject");
    }

    if ((message.content || "").length > 1200) {
      warnings.push("Long message");
    }

    if (hasSensitiveMessageContent(message)) {
      warnings.push("Sensitive care/personal context");
    }

    if (message.status === "approved") {
      warnings.push("Delivery evidence required");
    }

    const score = message.candidate?.compatibilityScore;
    if (typeof score === "number" && score < 60) {
      warnings.push("Low match score");
    }

    return warnings;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4" />;
      case "approved":
        return <CheckCircle2 className="h-4 w-4" />;
      case "sent":
        return <Send className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "failed":
        return <AlertTriangle className="h-4 w-4" />;
      case "replied":
        return <Mail className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-blue-100 text-blue-800";
      case "sent":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "replied":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading messages...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const queuedCount = messageCounts.queued ?? 0;
  const lockedCount = messages.filter(isMessageOutreachLocked).length;
  const approvableQueuedMessages =
    messages?.filter(
      message =>
        message.status === "queued" &&
        !isMessageOutreachLocked(message) &&
        !isDryRunMessage(message) &&
        !isArchivedMessage(message)
    ) || [];
  const approvableQueuedCount = approvableQueuedMessages.length;
  const sensitiveBulkMessageCount = approvableQueuedMessages.filter(
    hasSensitiveMessageContent
  ).length;
  const bulkRequiresSafetyAcknowledgement =
    approvableQueuedCount > BULK_APPROVAL_REVIEW_THRESHOLD;
  const bulkRequiresSensitiveAcknowledgement = sensitiveBulkMessageCount > 0;
  const bulkApprovalBlockedByAcknowledgement =
    !bulkComplianceAcknowledged ||
    (bulkRequiresSafetyAcknowledgement && !bulkSafetyAcknowledged) ||
    (bulkRequiresSensitiveAcknowledgement && !bulkSensitiveAcknowledged);
  const approvedCount = messageCounts.approved ?? 0;
  const sentCount = (messageCounts.sent ?? 0) + (messageCounts.delivered ?? 0);
  const failedCount = messageCounts.failed ?? 0;
  const repliedCount =
    (messageCounts.replied ?? 0) + (messageCounts.responded ?? 0);
  const pageStart = totalMessages === 0 ? 0 : currentPage * MESSAGE_PAGE_SIZE + 1;
  const pageEnd = Math.min(
    (currentPage + 1) * MESSAGE_PAGE_SIZE,
    totalMessages
  );
  const hasPreviousPage = currentPage > 0;
  const hasNextPage = pageEnd < totalMessages;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            <p className="text-muted-foreground mt-1">
              Review, edit, and approve outreach messages
            </p>
          </div>
          {queuedCount > 0 && (
            <Button
              onClick={() => setBulkApproveDialogOpen(true)}
              className="bg-gradient-to-r from-green-600 to-emerald-600"
              disabled={bulkApprove.isPending || approvableQueuedCount === 0}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve Visible Queued ({approvableQueuedCount})
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queued</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queuedCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedCount}</div>
              <p className="text-xs text-muted-foreground">
                Needs send evidence
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
              <Send className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentCount}</div>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{failedCount}</div>
              <p className="text-xs text-muted-foreground">Needs attention</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Replied</CardTitle>
              <Mail className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{repliedCount}</div>
              <p className="text-xs text-muted-foreground">
                Responses received
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Locked</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lockedCount}</div>
              <p className="text-xs text-muted-foreground">
                Stop or pause outreach
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={value => {
                    setStatusFilter(value);
                    setCurrentPage(0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select
                  value={campaignFilter}
                  onValueChange={value => {
                    setCampaignFilter(value);
                    setCurrentPage(0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns?.map(campaign => (
                      <SelectItem
                        key={campaign.id}
                        value={campaign.id.toString()}
                      >
                        {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages List */}
        {messages.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No messages found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {statusFilter !== "all" || campaignFilter !== "all"
                  ? "Try adjusting your filters to see more messages."
                  : "Start a campaign with draft messages enabled to see messages here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Showing {pageStart}-{pageEnd} of {totalMessages} messages
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(page => Math.max(0, page - 1))}
                  disabled={!hasPreviousPage}
                >
                  Previous
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground">
                  Page {currentPage + 1}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(page => page + 1)}
                  disabled={!hasNextPage}
                >
                  Next
                </Button>
              </div>
            </div>
            {messages.map(message => {
              const warnings = getMessageWarnings(message);
              const terminalResponse = getTerminalResponse(message);
              const outreachLocked = !!terminalResponse;
              const dryRunLocked = isDryRunMessage(message);
              const archivedLocked = isArchivedMessage(message);

              return (
                <Card
                  key={message.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getStatusColor(message.status)}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(message.status)}
                              {message.status}
                            </span>
                          </Badge>
                          <Badge variant="outline">
                            <Building className="h-3 w-3 mr-1" />
                            {message.platform?.name || "Unknown Platform"}
                          </Badge>
                          {dryRunLocked && (
                            <Badge
                              variant="outline"
                              className="border-blue-300 bg-blue-50 text-blue-800"
                            >
                              Dry Run
                            </Badge>
                          )}
                          {archivedLocked && (
                            <Badge
                              variant="outline"
                              className="border-slate-300 bg-slate-50 text-slate-800"
                            >
                              Archived
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="break-words text-lg">
                          {message.subject}
                        </CardTitle>
                        <CardDescription className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                          <User className="h-4 w-4" />
                          To: {message.candidate?.name || "Unknown"}
                          {message.candidate?.location &&
                            ` • ${message.candidate.location}`}
                        </CardDescription>
                        {warnings.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {warnings.map(warning => (
                              <Badge
                                key={warning}
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-amber-800"
                              >
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {warning}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {message.status === "queued" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(message)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700"
                              data-testid={`approve-message-${message.id}`}
                              onClick={() => handleApprove(message)}
                              disabled={
                                approveMessage.isPending ||
                                outreachLocked ||
                                dryRunLocked ||
                                archivedLocked
                              }
                              title={
                                archivedLocked
                                  ? "Approval is blocked because this campaign is archived."
                                  : dryRunLocked
                                    ? "Approval is blocked because this campaign is in dry-run mode."
                                    : outreachLocked
                                      ? "Approval is blocked because this candidate response says to stop or pause outreach."
                                      : "Approve message"
                              }
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleReject(message.id)}
                              disabled={rejectMessage.isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {message.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-blue-700 hover:text-blue-800"
                            data-testid={`record-delivery-${message.id}`}
                            onClick={() => handleOpenDeliveryDialog(message)}
                            disabled={
                              outreachLocked || dryRunLocked || archivedLocked
                            }
                            title={
                              archivedLocked
                                ? "Delivery is blocked because this campaign is archived."
                                : dryRunLocked
                                  ? "Delivery is blocked because this campaign is in dry-run mode."
                                  : outreachLocked
                                    ? "Delivery is blocked because this candidate response says to stop or pause outreach."
                                    : "Record delivery evidence"
                            }
                          >
                            <ClipboardCheck className="h-4 w-4" />
                            Record delivery
                          </Button>
                        )}
                        {message.status === "sent" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-purple-700 hover:text-purple-800"
                            data-testid={`record-response-${message.id}`}
                            onClick={() => handleOpenResponseDialog(message)}
                          >
                            <Mail className="h-4 w-4" />
                            Record response
                          </Button>
                        )}
                        {outreachLocked && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-red-700 hover:text-red-800"
                            data-testid={`reopen-outreach-${message.id}`}
                            onClick={() => handleOpenReopenDialog(message)}
                          >
                            <LockOpen className="h-4 w-4" />
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                    {message.candidate && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          <strong>Compatibility Score:</strong>{" "}
                          {message.candidate.compatibilityScore}%
                          {message.candidate.experience && (
                            <>
                              {" "}
                              • <strong>Experience:</strong>{" "}
                              {message.candidate.experience}
                            </>
                          )}
                        </p>
                        {terminalResponse && (
                          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                            <div className="font-medium">
                              Outreach locked:{" "}
                              {
                                terminalResponseLabels[
                                  terminalResponse.classification
                                ]
                              }
                            </div>
                            <div className="mt-1 text-red-700">
                              Approval and delivery are blocked until this
                              candidate is explicitly reopened.
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-3 gap-2 border-red-300 bg-white text-red-700 hover:bg-red-100"
                              onClick={() => handleOpenReopenDialog(message)}
                            >
                              <LockOpen className="h-4 w-4" />
                              Reopen with audit reason
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Edit Message Dialog */}
        <Dialog
          open={!!editingMessage}
          onOpenChange={() => setEditingMessage(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Message</DialogTitle>
              <DialogDescription>
                Make changes to the message before approving it for sending
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={editedSubject}
                  onChange={e => setEditedSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Message Content</Label>
                <Textarea
                  id="content"
                  value={editedContent}
                  onChange={e => setEditedContent(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMessage(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={updateMessage.isPending}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={bulkApproveDialogOpen}
          onOpenChange={handleBulkApproveDialogOpenChange}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve all queued messages?</AlertDialogTitle>
              <AlertDialogDescription>
                This will approve {approvableQueuedCount} queued message
                {approvableQueuedCount === 1 ? "" : "s"} in the current view.
                {lockedCount > 0
                  ? ` ${lockedCount} locked message${lockedCount === 1 ? "" : "s"} will be skipped because the latest candidate response says to stop or pause outreach.`
                  : ""}{" "}
                Approved messages still require delivery evidence before they
                are marked sent, so review warnings and edits first if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Bulk approval safeguard</p>
                  <p>
                    Review-gated approval stays enabled, but this batch needs
                    explicit acknowledgement before it can proceed.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={bulkComplianceAcknowledged}
                  onCheckedChange={checked =>
                    setBulkComplianceAcknowledged(checked === true)
                  }
                  data-testid="bulk-compliance-ack"
                />
                <span>
                  I reviewed candidate consent signals, platform rules, and
                  duplicate warnings before approving this batch.
                </span>
              </label>
              {bulkRequiresSafetyAcknowledgement && (
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={bulkSafetyAcknowledged}
                    onCheckedChange={checked =>
                      setBulkSafetyAcknowledged(checked === true)
                    }
                    data-testid="bulk-safety-ack"
                  />
                  <span>
                    I reviewed that this batch contains more than{" "}
                    {BULK_APPROVAL_REVIEW_THRESHOLD} messages and should still
                    be approved.
                  </span>
                </label>
              )}
              {bulkRequiresSensitiveAcknowledgement && (
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={bulkSensitiveAcknowledged}
                    onCheckedChange={checked =>
                      setBulkSensitiveAcknowledged(checked === true)
                    }
                    data-testid="bulk-sensitive-ack"
                  />
                  <span>
                    I reviewed {sensitiveBulkMessageCount} message
                    {sensitiveBulkMessageCount === 1 ? "" : "s"} with care,
                    health, or personal-context warnings.
                  </span>
                </label>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={bulkApprove.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkApprove}
                disabled={
                  bulkApprove.isPending ||
                  approvableQueuedCount === 0 ||
                  bulkApprovalBlockedByAcknowledgement
                }
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Approve {approvableQueuedCount}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!sensitiveApprovalMessage}
          onOpenChange={open => {
            if (!open) {
              setSensitiveApprovalMessage(null);
              setSensitiveApprovalAcknowledged(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve sensitive message?</AlertDialogTitle>
              <AlertDialogDescription>
                This message includes care, health, or personal-context
                warnings. Review the content before approving it for controlled
                delivery.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Sensitive approval safeguard</p>
                  <p>
                    Approval only moves this message into the evidence-backed
                    send queue. It still cannot be marked sent without delivery
                    evidence.
                  </p>
                </div>
              </div>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={sensitiveApprovalAcknowledged}
                  onCheckedChange={checked =>
                    setSensitiveApprovalAcknowledged(checked === true)
                  }
                  data-testid="sensitive-approval-ack"
                />
                <span>
                  I reviewed the message content and the sensitive-context
                  warning before approval.
                </span>
              </label>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={approveMessage.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSensitiveApproval}
                disabled={
                  approveMessage.isPending || !sensitiveApprovalAcknowledged
                }
                className="bg-green-600 text-white hover:bg-green-700"
                data-testid="sensitive-approval-confirm"
              >
                Approve Message
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={!!reopenMessage}
          onOpenChange={open => {
            if (!open) {
              setReopenMessage(null);
              setReopenReason("");
            }
          }}
        >
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Reopen candidate outreach</DialogTitle>
              <DialogDescription>
                Reopen only when you have a clear reason that the latest stop or
                unavailable response no longer applies. The original response
                stays in history and this decision is audit logged.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <div className="font-medium">
                  {reopenMessage?.candidate?.name || "Unknown candidate"}
                </div>
                <div className="mt-1">
                  Current lock:{" "}
                  {reopenMessage
                    ? terminalResponseLabels[
                        getTerminalResponse(reopenMessage)?.classification
                      ]
                    : "Unknown"}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reopenReason">Audit reason</Label>
                <Textarea
                  id="reopenReason"
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  placeholder="Example: Candidate later confirmed they are available again and agreed that we may follow up."
                  rows={5}
                  data-testid="reopen-reason"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReopenMessage(null);
                  setReopenReason("");
                }}
                disabled={reopenOutreach.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReopenOutreach}
                disabled={
                  reopenOutreach.isPending || reopenReason.trim().length < 8
                }
                className="bg-red-700 text-white hover:bg-red-800"
                data-testid="reopen-submit"
              >
                {reopenOutreach.isPending ? "Reopening..." : "Reopen Outreach"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!deliveryMessage}
          onOpenChange={open => {
            if (!open) setDeliveryMessage(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record delivery evidence</DialogTitle>
              <DialogDescription>
                Mark this approved message as sent only after you have sent it
                externally and can record deterministic evidence. Failed
                attempts stay visible for follow-up.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Select
                  value={deliveryStatus}
                  onValueChange={value =>
                    setDeliveryStatus(value as "succeeded" | "failed")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="succeeded">
                      Sent with evidence
                    </SelectItem>
                    <SelectItem value="failed">Send failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {deliveryStatus === "succeeded" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="confirmationText">
                      Platform confirmation text
                    </Label>
                    <Textarea
                      id="confirmationText"
                      value={confirmationText}
                      onChange={e => setConfirmationText(e.target.value)}
                      placeholder="Example: Nationale Hulpgids showed 'Bericht verzonden' for this candidate."
                      maxLength={2000}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="externalMessageId">
                      External message id or URL
                    </Label>
                    <Input
                      id="externalMessageId"
                      value={externalMessageId}
                      onChange={e => setExternalMessageId(e.target.value)}
                      placeholder="Optional if confirmation text is provided"
                      maxLength={255}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="sendErrorMessage">Failure reason</Label>
                  <Textarea
                    id="sendErrorMessage"
                    value={sendErrorMessage}
                    onChange={e => setSendErrorMessage(e.target.value)}
                    placeholder="Example: platform rejected the message because the profile is unavailable."
                    maxLength={1000}
                    rows={4}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeliveryMessage(null)}
                disabled={recordSendAttempt.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordSendAttempt}
                disabled={recordSendAttempt.isPending}
              >
                {recordSendAttempt.isPending
                  ? "Recording..."
                  : deliveryStatus === "succeeded"
                    ? "Mark Sent"
                    : "Record Failure"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!responseMessage}
          onOpenChange={open => {
            if (!open) setResponseMessage(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record candidate response</DialogTitle>
              <DialogDescription>
                Capture a reply you received outside the tool. This moves the
                message to replied and adds it to the Response Inbox.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="font-medium">
                  {responseMessage?.candidate?.name || "Unknown candidate"}
                </div>
                <div className="text-muted-foreground">
                  {responseMessage?.subject || "No subject"}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responseContent">Reply text</Label>
                <Textarea
                  id="responseContent"
                  value={responseContent}
                  onChange={e => setResponseContent(e.target.value)}
                  placeholder="Paste or summarize the candidate reply here."
                  rows={6}
                  data-testid="response-content"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Classification</Label>
                  <Select
                    value={responseClassification}
                    onValueChange={setResponseClassification}
                  >
                    <SelectTrigger data-testid="response-classification">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto classify</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="not_interested">
                        Not interested
                      </SelectItem>
                      <SelectItem value="more_info">Needs info</SelectItem>
                      <SelectItem value="unavailable">Unavailable</SelectItem>
                      <SelectItem value="no_response">No response</SelectItem>
                      <SelectItem value="unknown">Unknown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responseConfidence">Confidence</Label>
                  <Input
                    id="responseConfidence"
                    type="number"
                    min="0"
                    max="100"
                    value={responseConfidence}
                    onChange={e => setResponseConfidence(e.target.value)}
                    placeholder="Auto"
                    data-testid="response-confidence"
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
                    <SelectTrigger>
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
                onClick={() => setResponseMessage(null)}
                disabled={recordResponse.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRecordResponse}
                disabled={recordResponse.isPending}
                data-testid="record-response-submit"
              >
                {recordResponse.isPending ? "Recording..." : "Record Response"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
