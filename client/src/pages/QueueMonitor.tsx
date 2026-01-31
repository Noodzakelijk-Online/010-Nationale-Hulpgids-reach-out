import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Activity, Clock, CheckCircle2, XCircle, Pause, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function QueueMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedQueue, setSelectedQueue] = useState<"messages" | "discovery">("messages");
  const [selectedStatus, setSelectedStatus] = useState<"waiting" | "active" | "completed" | "failed" | "delayed" | undefined>();
  
  const { data: messageQueueStats, refetch: refetchMessages } = trpc.queue.getStats.useQuery(
    { queueName: "messages" },
    { refetchInterval: autoRefresh ? 3000 : false }
  );

  const { data: discoveryQueueStats, refetch: refetchDiscovery } = trpc.queue.getStats.useQuery(
    { queueName: "discovery" },
    { refetchInterval: autoRefresh ? 3000 : false }
  );

  const { data: jobs, refetch: refetchJobs } = trpc.queue.getJobs.useQuery(
    { queueName: selectedQueue, status: selectedStatus, start: 0, end: 49 },
    { refetchInterval: autoRefresh ? 5000 : false }
  );

  const handleRefresh = () => {
    refetchMessages();
    refetchDiscovery();
    refetchJobs();
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

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
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

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs">Job History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Message Queue Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Message Queue
                </CardTitle>
                <CardDescription>Outreach message delivery queue</CardDescription>
              </CardHeader>
              <CardContent>
                {messageQueueStats ? (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Waiting</span>
                        <span className="text-2xl font-bold">{messageQueueStats.waiting}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Active</span>
                        <span className="text-2xl font-bold">{messageQueueStats.active}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Completed</span>
                        <span className="text-2xl font-bold text-green-600">{messageQueueStats.completed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Failed</span>
                        <span className="text-2xl font-bold text-red-600">{messageQueueStats.failed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Delayed</span>
                        <span className="text-2xl font-bold">{messageQueueStats.delayed}</span>
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
                            style={{ width: `${calculatePercentage(messageQueueStats.waiting, messageQueueStats.total)}%` }}
                          />
                        )}
                        {messageQueueStats.active > 0 && (
                          <div
                            className={`${getStatusColor("active")} h-full`}
                            style={{ width: `${calculatePercentage(messageQueueStats.active, messageQueueStats.total)}%` }}
                          />
                        )}
                        {messageQueueStats.completed > 0 && (
                          <div
                            className={`${getStatusColor("completed")} h-full`}
                            style={{ width: `${calculatePercentage(messageQueueStats.completed, messageQueueStats.total)}%` }}
                          />
                        )}
                        {messageQueueStats.failed > 0 && (
                          <div
                            className={`${getStatusColor("failed")} h-full`}
                            style={{ width: `${calculatePercentage(messageQueueStats.failed, messageQueueStats.total)}%` }}
                          />
                        )}
                        {messageQueueStats.delayed > 0 && (
                          <div
                            className={`${getStatusColor("delayed")} h-full`}
                            style={{ width: `${calculatePercentage(messageQueueStats.delayed, messageQueueStats.total)}%` }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Health Status */}
                    <div className="flex items-center gap-2 pt-2">
                      {messageQueueStats.failed === 0 && messageQueueStats.total > 0 ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Healthy</span>
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
                          <span className="text-sm font-medium text-muted-foreground">Idle</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Loading queue statistics...</div>
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
                <CardDescription>Candidate discovery and scraping queue</CardDescription>
              </CardHeader>
              <CardContent>
                {discoveryQueueStats ? (
                  <div className="space-y-6">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Waiting</span>
                        <span className="text-2xl font-bold">{discoveryQueueStats.waiting}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Active</span>
                        <span className="text-2xl font-bold">{discoveryQueueStats.active}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Completed</span>
                        <span className="text-2xl font-bold text-green-600">{discoveryQueueStats.completed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Failed</span>
                        <span className="text-2xl font-bold text-red-600">{discoveryQueueStats.failed}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-muted-foreground">Delayed</span>
                        <span className="text-2xl font-bold">{discoveryQueueStats.delayed}</span>
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
                            style={{ width: `${calculatePercentage(discoveryQueueStats.waiting, discoveryQueueStats.total)}%` }}
                          />
                        )}
                        {discoveryQueueStats.active > 0 && (
                          <div
                            className={`${getStatusColor("active")} h-full`}
                            style={{ width: `${calculatePercentage(discoveryQueueStats.active, discoveryQueueStats.total)}%` }}
                          />
                        )}
                        {discoveryQueueStats.completed > 0 && (
                          <div
                            className={`${getStatusColor("completed")} h-full`}
                            style={{ width: `${calculatePercentage(discoveryQueueStats.completed, discoveryQueueStats.total)}%` }}
                          />
                        )}
                        {discoveryQueueStats.failed > 0 && (
                          <div
                            className={`${getStatusColor("failed")} h-full`}
                            style={{ width: `${calculatePercentage(discoveryQueueStats.failed, discoveryQueueStats.total)}%` }}
                          />
                        )}
                        {discoveryQueueStats.delayed > 0 && (
                          <div
                            className={`${getStatusColor("delayed")} h-full`}
                            style={{ width: `${calculatePercentage(discoveryQueueStats.delayed, discoveryQueueStats.total)}%` }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Health Status */}
                    <div className="flex items-center gap-2 pt-2">
                      {discoveryQueueStats.failed === 0 && discoveryQueueStats.total > 0 ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="text-sm font-medium text-green-600">Healthy</span>
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
                          <span className="text-sm font-medium text-muted-foreground">Idle</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">Loading queue statistics...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Job History</CardTitle>
                <CardDescription>Detailed view of all queue jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant={selectedQueue === "messages" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedQueue("messages")}
                    >
                      Message Queue
                    </Button>
                    <Button
                      variant={selectedQueue === "discovery" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedQueue("discovery")}
                    >
                      Discovery Queue
                    </Button>
                    <div className="border-l mx-2" />
                    <Button
                      variant={selectedStatus === undefined ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus(undefined)}
                    >
                      All
                    </Button>
                    <Button
                      variant={selectedStatus === "waiting" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("waiting")}
                    >
                      Waiting
                    </Button>
                    <Button
                      variant={selectedStatus === "active" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("active")}
                    >
                      Active
                    </Button>
                    <Button
                      variant={selectedStatus === "completed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("completed")}
                    >
                      Completed
                    </Button>
                    <Button
                      variant={selectedStatus === "failed" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedStatus("failed")}
                    >
                      Failed
                    </Button>
                    <Button
                      variant={selectedStatus === "delayed" ? "default" : "outline"}
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
                              <TableCell className="font-mono text-xs">{job.id.slice(-12)}</TableCell>
                              <TableCell>{job.name}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(job.status)}>
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
                                  <span className="text-xs text-muted-foreground">{job.progress}%</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {job.attempts}/{job.maxAttempts}
                              </TableCell>
                              <TableCell className="text-xs">{formatDate(job.createdAt)}</TableCell>
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
                      <p className="text-sm">Jobs will appear here as they are processed</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
