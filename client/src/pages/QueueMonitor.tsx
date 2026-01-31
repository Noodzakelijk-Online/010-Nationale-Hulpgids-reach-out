import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, Clock, CheckCircle2, XCircle, Pause } from "lucide-react";
import { toast } from "sonner";

export default function QueueMonitor() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  const { data: messageQueueStats, refetch: refetchMessages } = trpc.queue.getStats.useQuery(
    { queueName: "messages" },
    { refetchInterval: autoRefresh ? 3000 : false }
  );

  const { data: discoveryQueueStats, refetch: refetchDiscovery } = trpc.queue.getStats.useQuery(
    { queueName: "discovery" },
    { refetchInterval: autoRefresh ? 3000 : false }
  );

  const handleRefresh = () => {
    refetchMessages();
    refetchDiscovery();
    toast.success("Queue statistics refreshed");
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

  const calculatePercentage = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
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

      {/* Message Queue Stats */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-6 w-6 text-purple-500" />
          Message Queue
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Waiting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.waiting || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(messageQueueStats?.waiting || 0, messageQueueStats?.total || 0)}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-yellow-500" />
                Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.active || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently processing
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.completed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(messageQueueStats?.completed || 0, messageQueueStats?.total || 0)}% success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.failed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(messageQueueStats?.failed || 0, messageQueueStats?.total || 0)}% failure rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Pause className="h-4 w-4 text-purple-500" />
                Delayed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.delayed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled for retry
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{messageQueueStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visual Progress Bar */}
        {messageQueueStats && messageQueueStats.total > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Queue Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-4 rounded-full overflow-hidden">
                {messageQueueStats.waiting > 0 && (
                  <div
                    className="bg-blue-500"
                    style={{ width: `${calculatePercentage(messageQueueStats.waiting, messageQueueStats.total)}%` }}
                    title={`Waiting: ${messageQueueStats.waiting}`}
                  />
                )}
                {messageQueueStats.active > 0 && (
                  <div
                    className="bg-yellow-500"
                    style={{ width: `${calculatePercentage(messageQueueStats.active, messageQueueStats.total)}%` }}
                    title={`Active: ${messageQueueStats.active}`}
                  />
                )}
                {messageQueueStats.completed > 0 && (
                  <div
                    className="bg-green-500"
                    style={{ width: `${calculatePercentage(messageQueueStats.completed, messageQueueStats.total)}%` }}
                    title={`Completed: ${messageQueueStats.completed}`}
                  />
                )}
                {messageQueueStats.failed > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${calculatePercentage(messageQueueStats.failed, messageQueueStats.total)}%` }}
                    title={`Failed: ${messageQueueStats.failed}`}
                  />
                )}
                {messageQueueStats.delayed > 0 && (
                  <div
                    className="bg-purple-500"
                    style={{ width: `${calculatePercentage(messageQueueStats.delayed, messageQueueStats.total)}%` }}
                    title={`Delayed: ${messageQueueStats.delayed}`}
                  />
                )}
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Waiting: {messageQueueStats.waiting}</span>
                <span>Active: {messageQueueStats.active}</span>
                <span>Completed: {messageQueueStats.completed}</span>
                <span>Failed: {messageQueueStats.failed}</span>
                <span>Delayed: {messageQueueStats.delayed}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Discovery Queue Stats */}
      <div>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-6 w-6 text-cyan-500" />
          Discovery Queue
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Waiting
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.waiting || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(discoveryQueueStats?.waiting || 0, discoveryQueueStats?.total || 0)}% of total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-yellow-500" />
                Active
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.active || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Currently scraping
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.completed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(discoveryQueueStats?.completed || 0, discoveryQueueStats?.total || 0)}% success rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.failed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {calculatePercentage(discoveryQueueStats?.failed || 0, discoveryQueueStats?.total || 0)}% failure rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Pause className="h-4 w-4 text-purple-500" />
                Delayed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.delayed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Scheduled for retry
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{discoveryQueueStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Visual Progress Bar */}
        {discoveryQueueStats && discoveryQueueStats.total > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Queue Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-4 rounded-full overflow-hidden">
                {discoveryQueueStats.waiting > 0 && (
                  <div
                    className="bg-blue-500"
                    style={{ width: `${calculatePercentage(discoveryQueueStats.waiting, discoveryQueueStats.total)}%` }}
                    title={`Waiting: ${discoveryQueueStats.waiting}`}
                  />
                )}
                {discoveryQueueStats.active > 0 && (
                  <div
                    className="bg-yellow-500"
                    style={{ width: `${calculatePercentage(discoveryQueueStats.active, discoveryQueueStats.total)}%` }}
                    title={`Active: ${discoveryQueueStats.active}`}
                  />
                )}
                {discoveryQueueStats.completed > 0 && (
                  <div
                    className="bg-green-500"
                    style={{ width: `${calculatePercentage(discoveryQueueStats.completed, discoveryQueueStats.total)}%` }}
                    title={`Completed: ${discoveryQueueStats.completed}`}
                  />
                )}
                {discoveryQueueStats.failed > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${calculatePercentage(discoveryQueueStats.failed, discoveryQueueStats.total)}%` }}
                    title={`Failed: ${discoveryQueueStats.failed}`}
                  />
                )}
                {discoveryQueueStats.delayed > 0 && (
                  <div
                    className="bg-purple-500"
                    style={{ width: `${calculatePercentage(discoveryQueueStats.delayed, discoveryQueueStats.total)}%` }}
                    title={`Delayed: ${discoveryQueueStats.delayed}`}
                  />
                )}
              </div>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Waiting: {discoveryQueueStats.waiting}</span>
                <span>Active: {discoveryQueueStats.active}</span>
                <span>Completed: {discoveryQueueStats.completed}</span>
                <span>Failed: {discoveryQueueStats.failed}</span>
                <span>Delayed: {discoveryQueueStats.delayed}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Health Status */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Queue Health</CardTitle>
          <CardDescription>Overall system status and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {messageQueueStats && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={messageQueueStats.failed > 10 ? "destructive" : "default"}>
                    Message Queue
                  </Badge>
                  <span className="text-sm">
                    {messageQueueStats.failed > 10
                      ? "High failure rate detected"
                      : messageQueueStats.active > 0
                      ? "Processing messages"
                      : "Idle"}
                  </span>
                </div>
                <Badge variant={messageQueueStats.failed > 10 ? "destructive" : "default"}>
                  {messageQueueStats.failed > 10 ? "Warning" : "Healthy"}
                </Badge>
              </div>
            )}

            {discoveryQueueStats && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={discoveryQueueStats.failed > 5 ? "destructive" : "default"}>
                    Discovery Queue
                  </Badge>
                  <span className="text-sm">
                    {discoveryQueueStats.failed > 5
                      ? "High failure rate detected"
                      : discoveryQueueStats.active > 0
                      ? "Scraping platforms"
                      : "Idle"}
                  </span>
                </div>
                <Badge variant={discoveryQueueStats.failed > 5 ? "destructive" : "default"}>
                  {discoveryQueueStats.failed > 5 ? "Warning" : "Healthy"}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
