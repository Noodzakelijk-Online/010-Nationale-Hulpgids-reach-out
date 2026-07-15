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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus,
  Target,
  Users,
  MessageSquare,
  TrendingUp,
  ArrowLeft,
  Calendar,
  Clock,
  Repeat,
  Play,
  Pause,
  Archive,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { CampaignWizard } from "@/components/CampaignWizard";
import { toast } from "sonner";

export default function Campaigns() {
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [campaignToArchive, setCampaignToArchive] = useState<number | null>(
    null
  );
  const [queueFilter, setQueueFilter] = useState<"messages" | "discovery">(
    "messages"
  );
  const [jobStatus, setJobStatus] = useState<
    "waiting" | "active" | "completed" | "failed" | "delayed" | undefined
  >();

  const { user, loading: authLoading } = useAuth();
  const {
    data: campaigns,
    isLoading,
    refetch,
  } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: operatingSummaries } =
    trpc.campaigns.listOperatingSummaries.useQuery(undefined, {
      enabled: !!user,
    });
  const archiveCampaign = trpc.campaigns.delete.useMutation();
  const pauseCampaign = trpc.campaigns.pause.useMutation();
  const resumeCampaign = trpc.campaigns.resume.useMutation();
  const { data: queueStats } = trpc.queue.getStats.useQuery(
    { queueName: queueFilter },
    {
      enabled: activeTab === "queue",
      refetchInterval: activeTab === "queue" ? 10000 : false,
    }
  );
  const { data: jobs } = trpc.queue.getJobs.useQuery(
    {
      queueName: queueFilter,
      status: jobStatus,
      start: 0,
      end: 49,
    },
    {
      enabled: activeTab === "queue",
      refetchInterval: activeTab === "queue" ? 10000 : false,
    }
  );

  const activeCampaigns = campaigns?.filter(
    (c: any) => c.status === "active" || c.status === "draft"
  );
  const scheduledCampaigns = campaigns?.filter(
    (c: any) =>
      c.isScheduled === 1 && (c.status === "scheduled" || c.status === "paused")
  );
  const archivedCampaigns = campaigns?.filter(
    (c: any) => c.status === "archived"
  );
  const operatingSummaryByCampaign = new Map(
    operatingSummaries?.map((summary: any) => [summary.campaignId, summary]) ||
      []
  );

  const handleArchive = async () => {
    if (!campaignToArchive) return;

    try {
      await archiveCampaign.mutateAsync({ id: campaignToArchive });
      toast.success("Campaign archived; ledger records are preserved");
      refetch();
      setArchiveDialogOpen(false);
      setCampaignToArchive(null);
    } catch (error) {
      toast.error("Failed to archive campaign");
    }
  };

  const handlePause = async (campaignId: number) => {
    try {
      await pauseCampaign.mutateAsync({ id: campaignId });
      toast.success("Campaign paused successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to pause campaign");
    }
  };

  const handleResume = async (campaignId: number) => {
    try {
      await resumeCampaign.mutateAsync({ id: campaignId });
      toast.success("Campaign resumed successfully");
      refetch();
    } catch (error) {
      toast.error("Failed to resume campaign");
    }
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleString();
  };

  const getRecurringLabel = (pattern: string | null) => {
    if (!pattern) return null;
    return pattern.charAt(0).toUpperCase() + pattern.slice(1);
  };

  const getReadinessClass = (status?: string) => {
    if (status === "ready") return "bg-green-100 text-green-800";
    if (status === "blocked") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
  };

  if (showWizard) {
    return (
      <DashboardLayout>
        <div className="min-w-0 px-0 py-2 sm:px-2">
          <Button
            variant="ghost"
            onClick={() => setShowWizard(false)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Campaigns
          </Button>
          <CampaignWizard
            onComplete={() => {
              setShowWizard(false);
              refetch();
            }}
            onCancel={() => setShowWizard(false)}
          />
        </div>
      </DashboardLayout>
    );
  }

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading campaigns...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-6 p-3 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Campaign Management
            </h1>
            <p className="text-gray-600 mt-1">
              Manage your outreach campaigns, schedules, and queue status
            </p>
          </div>
          <Button
            onClick={() => setShowWizard(true)}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {/* Tabbed Interface */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList className="grid h-auto w-full grid-cols-1 sm:grid-cols-4">
            <TabsTrigger value="active">
              <Target className="h-4 w-4 mr-2" />
              Active Campaigns
            </TabsTrigger>
            <TabsTrigger value="scheduled">
              <Calendar className="h-4 w-4 mr-2" />
              Scheduled
            </TabsTrigger>
            <TabsTrigger value="queue">
              <Activity className="h-4 w-4 mr-2" />
              Queue Monitor
            </TabsTrigger>
            <TabsTrigger value="archived">
              <Archive className="h-4 w-4 mr-2" />
              Archived
            </TabsTrigger>
          </TabsList>

          {/* Active Campaigns Tab */}
          <TabsContent value="active" className="space-y-4">
            {activeCampaigns && activeCampaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeCampaigns.map((campaign: any) => {
                  const operating = operatingSummaryByCampaign.get(
                    campaign.id
                  ) as any;
                  return (
                    <Card
                      key={campaign.id}
                      className="hover:shadow-lg transition-shadow"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">
                              {campaign.title}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {campaign.description}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <Badge
                              variant={
                                campaign.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {campaign.status}
                            </Badge>
                            <Badge
                              className={getReadinessClass(
                                operating?.readiness?.status
                              )}
                            >
                              {operating?.readiness?.status || "checking"}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Stats */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-3 bg-blue-50 rounded-lg">
                              <p className="text-2xl font-bold text-blue-600">
                                {campaign.candidatesFound}
                              </p>
                              <p className="text-xs text-gray-600">
                                Candidates
                              </p>
                            </div>
                            <div className="text-center p-3 bg-green-50 rounded-lg">
                              <p className="text-2xl font-bold text-green-600">
                                {campaign.messagesSent}
                              </p>
                              <p className="text-xs text-gray-600">Messages</p>
                            </div>
                            <div className="text-center p-3 bg-purple-50 rounded-lg">
                              <p className="text-2xl font-bold text-purple-600">
                                {campaign.responsesReceived}
                              </p>
                              <p className="text-xs text-gray-600">Responses</p>
                            </div>
                          </div>

                          {operating && (
                            <div className="rounded-lg border bg-gray-50 p-3 space-y-3">
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                  <p className="text-lg font-semibold text-amber-700">
                                    {operating.summary.messagesQueued}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    Review
                                  </p>
                                </div>
                                <div>
                                  <p className="text-lg font-semibold text-red-700">
                                    {operating.summary.sendAttemptsFailed}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    Failures
                                  </p>
                                </div>
                                <div>
                                  <p className="text-lg font-semibold text-blue-700">
                                    {operating.summary.followUpsDue}
                                  </p>
                                  <p className="text-xs text-gray-600">
                                    Follow-ups
                                  </p>
                                </div>
                              </div>
                              {operating.nextActions?.[0] && (
                                <div className="flex gap-2 text-xs text-gray-700">
                                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                                  <span>{operating.nextActions[0].detail}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Link
                              href={`/campaigns/${campaign.id}`}
                              className="flex-1"
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                              >
                                View Details
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setCampaignToArchive(campaign.id);
                                setArchiveDialogOpen(true);
                              }}
                              title="Archive campaign and preserve ledger records"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center">
                    <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Active Campaigns
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Create your first campaign to start reaching out to
                      candidates
                    </p>
                    <Button onClick={() => setShowWizard(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Campaign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Scheduled Campaigns Tab */}
          <TabsContent value="scheduled" className="space-y-4">
            {scheduledCampaigns && scheduledCampaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {scheduledCampaigns.map((campaign: any) => (
                  <Card
                    key={campaign.id}
                    className="hover:shadow-lg transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gray-900">
                              {campaign.title}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              {campaign.description}
                            </p>
                          </div>
                          <Badge
                            variant={
                              campaign.status === "paused"
                                ? "secondary"
                                : "default"
                            }
                          >
                            {campaign.status}
                          </Badge>
                        </div>

                        {/* Schedule Info */}
                        <div className="space-y-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-gray-700">
                              Next Run:
                            </span>
                            <span className="text-gray-900">
                              {formatDate(campaign.nextExecutionAt)}
                            </span>
                          </div>
                          {campaign.isRecurring === 1 && (
                            <div className="flex items-center gap-2 text-sm">
                              <Repeat className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-gray-700">
                                Pattern:
                              </span>
                              <span className="text-gray-900">
                                {getRecurringLabel(campaign.recurringPattern)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">
                              {campaign.candidatesFound}
                            </p>
                            <p className="text-xs text-gray-600">Candidates</p>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                              {campaign.messagesSent}
                            </p>
                            <p className="text-xs text-gray-600">Messages</p>
                          </div>
                          <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <p className="text-2xl font-bold text-purple-600">
                              {campaign.responsesReceived}
                            </p>
                            <p className="text-xs text-gray-600">Responses</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          {campaign.status === "paused" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleResume(campaign.id)}
                              disabled={resumeCampaign.isPending}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Resume
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handlePause(campaign.id)}
                              disabled={pauseCampaign.isPending}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setCampaignToArchive(campaign.id);
                              setArchiveDialogOpen(true);
                            }}
                            title="Archive campaign and preserve ledger records"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Scheduled Campaigns
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Schedule campaigns to run automatically at specific times
                    </p>
                    <Button onClick={() => setShowWizard(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Scheduled Campaign
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Queue Monitor Tab */}
          <TabsContent value="queue" className="space-y-4">
            {/* Queue Selector */}
            <div className="flex gap-2">
              <Button
                variant={queueFilter === "messages" ? "default" : "outline"}
                onClick={() => setQueueFilter("messages")}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Messages Queue
              </Button>
              <Button
                variant={queueFilter === "discovery" ? "default" : "outline"}
                onClick={() => setQueueFilter("discovery")}
              >
                <Users className="h-4 w-4 mr-2" />
                Discovery Queue
              </Button>
            </div>

            {/* Queue Stats */}
            {queueStats && (
              <div className="grid gap-4 md:grid-cols-5">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-blue-600">
                        {queueStats.waiting}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Waiting</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Activity className="h-8 w-8 text-purple-600 mx-auto mb-2 animate-pulse" />
                      <p className="text-3xl font-bold text-purple-600">
                        {queueStats.active}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Active</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-green-600">
                        {queueStats.completed}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Completed</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-red-600">
                        {queueStats.failed}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Failed</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-orange-600">
                        {queueStats.delayed}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">Delayed</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Job History */}
            <Card>
              <CardHeader>
                <CardTitle>Job History</CardTitle>
                <CardDescription>
                  Recent jobs in the {queueFilter} queue
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Status Filter */}
                <div className="flex gap-2 mb-4">
                  <Button
                    variant={jobStatus === undefined ? "default" : "outline"}
                    size="sm"
                    onClick={() => setJobStatus(undefined)}
                  >
                    All
                  </Button>
                  {["waiting", "active", "completed", "failed", "delayed"].map(
                    status => (
                      <Button
                        key={status}
                        variant={jobStatus === status ? "default" : "outline"}
                        size="sm"
                        onClick={() => setJobStatus(status as any)}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Button>
                    )
                  )}
                </div>

                {/* Jobs Table */}
                {jobs && jobs.length > 0 ? (
                  <div className="space-y-2">
                    {jobs.map((job: any) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                job.status === "completed"
                                  ? "default"
                                  : job.status === "failed"
                                    ? "destructive"
                                    : job.status === "active"
                                      ? "secondary"
                                      : "outline"
                              }
                            >
                              {job.status}
                            </Badge>
                            <span className="font-medium text-sm">
                              Job #{job.id}
                            </span>
                          </div>
                          {job.error && (
                            <p className="text-xs text-red-600 mt-1">
                              {job.error}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm text-gray-600">
                          {job.attemptsMade > 0 && (
                            <p>Attempts: {job.attemptsMade}</p>
                          )}
                          {job.progress !== undefined && (
                            <p>Progress: {job.progress}%</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No jobs found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="archived" className="space-y-4">
            {archivedCampaigns && archivedCampaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {archivedCampaigns.map((campaign: any) => {
                  const operating = operatingSummaryByCampaign.get(
                    campaign.id
                  ) as any;
                  return (
                    <Card key={campaign.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-lg">
                              {campaign.title}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {campaign.description}
                            </CardDescription>
                          </div>
                          <Badge variant="secondary">archived</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-blue-50 p-3">
                            <p className="text-2xl font-bold text-blue-600">
                              {campaign.candidatesFound}
                            </p>
                            <p className="text-xs text-gray-600">Candidates</p>
                          </div>
                          <div className="rounded-lg bg-green-50 p-3">
                            <p className="text-2xl font-bold text-green-600">
                              {campaign.messagesSent}
                            </p>
                            <p className="text-xs text-gray-600">Messages</p>
                          </div>
                          <div className="rounded-lg bg-purple-50 p-3">
                            <p className="text-2xl font-bold text-purple-600">
                              {campaign.responsesReceived}
                            </p>
                            <p className="text-xs text-gray-600">Responses</p>
                          </div>
                        </div>
                        {operating && (
                          <div className="rounded-lg border bg-gray-50 p-3 text-sm text-gray-700">
                            Ledger retained with{" "}
                            {operating.summary.messagesQueued} messages pending
                            review, {operating.summary.sendAttemptsFailed} send
                            failures, and {operating.summary.followUpsDue} due
                            follow-ups.
                          </div>
                        )}
                        <Link href={`/campaigns/${campaign.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                          >
                            View Preserved Ledger
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-16">
                  <div className="text-center">
                    <Archive className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Archived Campaigns
                    </h3>
                    <p className="text-gray-600">
                      Archived campaigns will remain available here with their
                      operating ledger intact.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Archive Confirmation Dialog */}
        <AlertDialog
          open={archiveDialogOpen}
          onOpenChange={setArchiveDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                This stops scheduling and active outreach for the campaign while
                preserving candidates, messages, approvals, send attempts,
                responses, follow-ups, and audit history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCampaignToArchive(null)}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchive}
                className="bg-amber-600 hover:bg-amber-700"
                disabled={archiveCampaign.isPending}
              >
                {archiveCampaign.isPending ? "Archiving..." : "Archive"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
