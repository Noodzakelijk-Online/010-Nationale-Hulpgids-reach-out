import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  RefreshCw,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

type QueueMonitorTab = "overview" | "jobs" | "durable";

function usePageVisible() {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

export default function QueueMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<QueueMonitorTab>("overview");
  const [selectedQueue, setSelectedQueue] = useState<"messages" | "discovery">(
    "messages"
  );
  const [selectedStatus, setSelectedStatus] = useState<
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "cancelled"
    | undefined
  >();
  const [durableLimit, setDurableLimit] = useState<50 | 100 | 200>(50);
  const [pendingCancelJob, setPendingCancelJob] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const pageVisible = usePageVisible();
  const shouldPoll = autoRefresh && pageVisible;
  const utils = trpc.useUtils();

  const { data: messageQueueStats, refetch: refetchMessages } =
    trpc.queue.getStats.useQuery(
      { queueName: "messages" },
      {
        enabled: activeTab === "overview",
        refetchInterval: shouldPoll && activeTab === "overview" ? 10000 : false,
      }
    );

  const { data: discoveryQueueStats, refetch: refetchDiscovery } =
    trpc.queue.getStats.useQuery(
      { queueName: "discovery" },
      {
        enabled: activeTab === "overview",
        refetchInterval: shouldPoll && activeTab === "overview" ? 10000 : false,
      }
    );

  const { data: jobs, refetch: refetchJobs } = trpc.queue.getJobs.useQuery(
    {
      queueName: selectedQueue,
      status: selectedStatus === "cancelled" ? undefined : selectedStatus,
      start: 0,
      end: 49,
    },
    {
      enabled: activeTab === "jobs",
      refetchInterval: shouldPoll && activeTab === "jobs" ? 15000 : false,
    }
  );
  const { data: durableJobs, refetch: refetchDurableJobs } =
    trpc.queue.getDurableJobs.useQuery(
      {
        queueName: selectedQueue,
        status: selectedStatus,
        limit: durableLimit,
        offset: 0,
      },
      {
        enabled: activeTab === "durable",
        refetchInterval: shouldPoll && activeTab === "durable" ? 15000 : false,
      }
    );
  const cancelJobMutation = trpc.queue.cancelJob.useMutation({
    onSuccess: async result => {
      toast.success(
        result.cancellationRequested
          ? "Discovery cancellation requested"
          : "Queue job cancelled"
      );
      setPendingCancelJob(null);
      setCancelReason("");
      await Promise.all([
        refetchDurableJobs(),
        utils.queue.getStats.invalidate(),
        utils.queue.getHealth.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message || "Failed to cancel queue job");
    },
  });

  const handleRefresh = () => {
    if (activeTab === "overview") {
      refetchMessages();
      refetchDiscovery();
    } else if (activeTab === "jobs") {
      refetchJobs();
    } else {
      refetchDurableJobs();
    }
    toast.success("Queue data refreshed");
  };

  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
    toast.info(autoRefresh ? "Auto-refresh disabled" : "Auto-refresh enabled");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "waiting":
        return "bg-blue-500";
      case "active":
        return "bg-yellow-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "delayed":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusBadgeVariant = (
    status: string
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed":
        return "default";
      case "failed":
        return "destructive";
      case "active":
        return "secondary";
      default:
        return "outline";
    }
  };

  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleString();
  };

  const formatDuration = (start: string | Date, end?: string | Date) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;

    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${Math.round(duration / 1000)}s`;
    return `${Math.round(duration / 60000)}m`;
  };

  const canCancelDurableJob = (job: any) =>
    job.status === "waiting" ||
    job.status === "delayed" ||
    (job.status === "active" && job.queueName === "discovery");

  const isActiveDiscoveryCancelRequest = (job: any) =>
    job?.status === "active" && job?.queueName === "discovery";

  const confirmCancelJob = () => {
    if (!pendingCancelJob) return;
    cancelJobMutation.mutate({
      id: pendingCancelJob.id,
      reason: cancelReason.trim() || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="container py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Queue Monitor</h1>
            <p className="text-muted-foreground">
              Real-time monitoring of message and discovery queues
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={toggleAutoRefresh}
            >
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as QueueMonitorTab)}
          className="space-y-6"
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">Job History</TabsTrigger>
            <TabsTrigger value="durable">Durable Records</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Message Queue Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Message Queue
                </CardTitle>
                <CardDescription>
                  Outreach message delivery queue
                </CardDescription>
              </CardHeader>
              <CardContent>
                {messageQueueStats ? (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Waiting
                        </span>
                        <span className="text-2xl font-bold">
                          {messageQueueStats.waiting}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Active
                        </span>
                        <span className="text-2xl font-bold">
                          {messageQueueStats.active}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Completed
                        </span>
                        <span className="text-2xl font-bold text-green-600">
                          {messageQueueStats.completed}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Failed
                        </span>
                        <span className="text-2xl font-bold text-red-600">
                          {messageQueueStats.failed}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Delayed
                        </span>
                        <span className="text-2xl font-bold">
                          {messageQueueStats.delayed}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Queue Distribution</span>
                        <span>{messageQueueStats.total} total jobs</span>
                      </div>
                      <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                        {messageQueueStats.waiting > 0 && (
                          <div
                            className={`${getStatusColor("waiting")} h-full`}
                            style={{
                              width: `${calculatePercentage(messageQueueStats.waiting, messageQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {messageQueueStats.active > 0 && (
                          <div
                            className={`${getStatusColor("active")} h-full`}
                            style={{
                              width: `${calculatePercentage(messageQueueStats.active, messageQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {messageQueueStats.completed > 0 && (
                          <div
                            className={`${getStatusColor("completed")} h-full`}
                            style={{
                              width: `${calculatePercentage(messageQueueStats.completed, messageQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {messageQueueStats.failed > 0 && (
                          <div
                            className={`${getStatusColor("failed")} h-full`}
                            style={{
                              width: `${calculatePercentage(messageQueueStats.failed, messageQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {messageQueueStats.delayed > 0 && (
                          <div
                            className={`${getStatusColor("delayed")} h-full`}
                            style={{
                              width: `${calculatePercentage(messageQueueStats.delayed, messageQueueStats.total)}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Health Status */}
                    <div className="flex items-center gap-2 pt-2">
                      {messageQueueStats.failed === 0 &&
                      messageQueueStats.total > 0 ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            Healthy
                          </span>
                        </>
                      ) : messageQueueStats.failed > 0 ? (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-600" />
                          <span className="text-sm font-medium text-yellow-600">
                            {messageQueueStats.failed} failed jobs
                          </span>
                        </>
                      ) : (
                        <>
                          <Pause className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            Idle
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading queue statistics...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Discovery Queue Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Discovery Queue
                </CardTitle>
                <CardDescription>
                  Candidate discovery and scraping queue
                </CardDescription>
              </CardHeader>
              <CardContent>
                {discoveryQueueStats ? (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Waiting
                        </span>
                        <span className="text-2xl font-bold">
                          {discoveryQueueStats.waiting}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Active
                        </span>
                        <span className="text-2xl font-bold">
                          {discoveryQueueStats.active}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Completed
                        </span>
                        <span className="text-2xl font-bold text-green-600">
                          {discoveryQueueStats.completed}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Failed
                        </span>
                        <span className="text-2xl font-bold text-red-600">
                          {discoveryQueueStats.failed}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">
                          Delayed
                        </span>
                        <span className="text-2xl font-bold">
                          {discoveryQueueStats.delayed}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Queue Distribution</span>
                        <span>{discoveryQueueStats.total} total jobs</span>
                      </div>
                      <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                        {discoveryQueueStats.waiting > 0 && (
                          <div
                            className={`${getStatusColor("waiting")} h-full`}
                            style={{
                              width: `${calculatePercentage(discoveryQueueStats.waiting, discoveryQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {discoveryQueueStats.active > 0 && (
                          <div
                            className={`${getStatusColor("active")} h-full`}
                            style={{
                              width: `${calculatePercentage(discoveryQueueStats.active, discoveryQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {discoveryQueueStats.completed > 0 && (
                          <div
                            className={`${getStatusColor("completed")} h-full`}
                            style={{
                              width: `${calculatePercentage(discoveryQueueStats.completed, discoveryQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {discoveryQueueStats.failed > 0 && (
                          <div
                            className={`${getStatusColor("failed")} h-full`}
                            style={{
                              width: `${calculatePercentage(discoveryQueueStats.failed, discoveryQueueStats.total)}%`,
                            }}
                          />
                        )}
                        {discoveryQueueStats.delayed > 0 && (
                          <div
                            className={`${getStatusColor("delayed")} h-full`}
                            style={{
                              width: `${calculatePercentage(discoveryQueueStats.delayed, discoveryQueueStats.total)}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Health Status */}
                    <div className="flex items-center gap-2 pt-2">
                      {discoveryQueueStats.failed === 0 &&
                      discoveryQueueStats.total > 0 ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            Healthy
                          </span>
                        </>
                      ) : discoveryQueueStats.failed > 0 ? (
                        <>
                          <AlertCircle className="h-5 w-5 text-yellow-600" />
                          <span className="text-sm font-medium text-yellow-600">
                            {discoveryQueueStats.failed} failed jobs
                          </span>
                        </>
                      ) : (
                        <>
                          <Pause className="h-5 w-5 text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            Idle
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading queue statistics...
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job History</CardTitle>
                <CardDescription>
                  Detailed view of all queue jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={
                        selectedQueue === "messages" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedQueue("messages")}
                    >
                      Message Queue
                    </Button>
                    <Button
                      variant={
                        selectedQueue === "discovery" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedQueue("discovery")}
                    >
                      Discovery Queue
                    </Button>
                    <div className="border-l mx-2" />
                    <Button
                      variant={
                        selectedStatus === undefined ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus(undefined)}
                    >
                      All
                    </Button>
                    <Button
                      variant={
                        selectedStatus === "waiting" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus("waiting")}
                    >
                      Waiting
                    </Button>
                    <Button
                      variant={
                        selectedStatus === "active" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus("active")}
                    >
                      Active
                    </Button>
                    <Button
                      variant={
                        selectedStatus === "completed" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus("completed")}
                    >
                      Completed
                    </Button>
                    <Button
                      variant={
                        selectedStatus === "failed" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus("failed")}
                    >
                      Failed
                    </Button>
                    <Button
                      variant={
                        selectedStatus === "delayed" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus("delayed")}
                    >
                      Delayed
                    </Button>
                  </div>

                  {/* Jobs Table */}
                  {jobs && jobs.length > 0 ? (
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Job ID</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Progress</TableHead>
                            <TableHead>Attempts</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {jobs.map((job: any) => (
                            <TableRow key={job.id}>
                              <TableCell className="font-mono text-xs">
                                {job.id.slice(-12)}
                              </TableCell>
                              <TableCell>{job.name}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={getStatusBadgeVariant(job.status)}
                                >
                                  {job.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary"
                                      style={{ width: `${job.progress}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {job.progress}%
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {job.attempts}/{job.maxAttempts}
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatDate(job.createdAt)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {formatDuration(job.createdAt, job.processedAt)}
                              </TableCell>
                              <TableCell>
                                {job.error && (
                                  <span className="text-xs text-red-600 truncate max-w-xs block">
                                    {job.error}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No jobs found</p>
                      <p className="text-sm">
                        Jobs will appear here as they are processed
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="durable" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Durable Queue Records</CardTitle>
                <CardDescription>
                  Persisted queue records used for restart-safe operational
                  visibility
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={
                        selectedQueue === "messages" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedQueue("messages")}
                    >
                      Message Queue
                    </Button>
                    <Button
                      variant={
                        selectedQueue === "discovery" ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedQueue("discovery")}
                    >
                      Discovery Queue
                    </Button>
                    <div className="border-l mx-2" />
                    {[
                      "waiting",
                      "active",
                      "completed",
                      "failed",
                      "delayed",
                      "cancelled",
                    ].map(status => (
                      <Button
                        key={status}
                        variant={
                          selectedStatus === status ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedStatus(status as any)}
                      >
                        {status}
                      </Button>
                    ))}
                    <Button
                      variant={
                        selectedStatus === undefined ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedStatus(undefined)}
                    >
                      All
                    </Button>
                    <div className="border-l mx-2" />
                    {[50, 100, 200].map(limit => (
                      <Button
                        key={limit}
                        variant={durableLimit === limit ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDurableLimit(limit as 50 | 100 | 200)}
                      >
                        Latest {limit}
                      </Button>
                    ))}
                  </div>

                  {durableJobs && durableJobs.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Showing {durableJobs.length} of the latest{" "}
                        {durableLimit} records for this filter.
                      </p>
                      <div className="border rounded-lg">
                        <Table className="min-w-[900px] table-fixed">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-14">ID</TableHead>
                              <TableHead className="w-24">Queue</TableHead>
                              <TableHead className="w-48">Type</TableHead>
                              <TableHead className="w-28">Status</TableHead>
                              <TableHead className="w-24">Campaign</TableHead>
                              <TableHead className="w-44">Created</TableHead>
                              <TableHead className="w-28">Actions</TableHead>
                              <TableHead>Error</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {durableJobs.map((job: any) => (
                              <TableRow key={job.id}>
                                <TableCell className="font-mono text-xs">
                                  {job.id}
                                </TableCell>
                                <TableCell>{job.queueName}</TableCell>
                                <TableCell
                                  className="truncate"
                                  title={job.jobType}
                                >
                                  {job.jobType}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={getStatusBadgeVariant(job.status)}
                                  >
                                    {job.status}
                                  </Badge>
                                </TableCell>
                                <TableCell>{job.campaignId || "-"}</TableCell>
                                <TableCell className="text-xs">
                                  {formatDate(job.createdAt)}
                                </TableCell>
                                <TableCell>
                                  {canCancelDurableJob(job) ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={() => {
                                        setPendingCancelJob(job);
                                        setCancelReason("");
                                      }}
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />
                                      {isActiveDiscoveryCancelRequest(job)
                                        ? "Request stop"
                                        : "Cancel"}
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">
                                      -
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-0">
                                  {job.errorMessage && (
                                    <span
                                      className="block truncate text-xs text-red-600"
                                      title={job.errorMessage}
                                    >
                                      {job.errorMessage}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No durable records found</p>
                      <p className="text-sm">
                        New queued work will be recorded here.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <AlertDialog
        open={Boolean(pendingCancelJob)}
        onOpenChange={open => {
          if (!open && !cancelJobMutation.isPending) {
            setPendingCancelJob(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActiveDiscoveryCancelRequest(pendingCancelJob)
                ? "Request discovery stop?"
                : "Cancel queued work?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActiveDiscoveryCancelRequest(pendingCancelJob)
                ? "This asks the active discovery worker to stop at the next safe checkpoint. It does not interrupt an in-flight platform request."
                : "This stops a waiting or delayed queue record before it starts. Active message jobs are not interrupted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label
              htmlFor="cancel-reason"
              className="text-sm font-medium leading-none"
            >
              Reason
            </label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={event => setCancelReason(event.target.value)}
              maxLength={300}
              placeholder="Optional operator note"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelJobMutation.isPending}>
              Keep job
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={event => {
                event.preventDefault();
                confirmCancelJob();
              }}
              disabled={cancelJobMutation.isPending}
            >
              {cancelJobMutation.isPending
                ? "Submitting..."
                : isActiveDiscoveryCancelRequest(pendingCancelJob)
                  ? "Request stop"
                  : "Cancel job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
