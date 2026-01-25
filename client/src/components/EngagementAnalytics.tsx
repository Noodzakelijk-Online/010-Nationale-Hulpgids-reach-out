import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Mail,
  MessageSquare,
  CheckCircle2,
  Clock,
  BarChart3,
} from "lucide-react";

interface EngagementMetrics {
  totalSent: number;
  totalReplied: number;
  totalPending: number;
  responseRate: number;
  avgResponseTime?: number; // in hours
  trend: "up" | "down" | "stable";
}

interface EngagementAnalyticsProps {
  metrics: EngagementMetrics;
}

export function EngagementAnalytics({ metrics }: EngagementAnalyticsProps) {
  const getTrendIcon = () => {
    switch (metrics.trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <BarChart3 className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTrendColor = () => {
    switch (metrics.trend) {
      case "up":
        return "text-green-600";
      case "down":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Engagement Analytics</h3>
        <Badge variant="outline" className="flex items-center gap-1">
          {getTrendIcon()}
          <span className={getTrendColor()}>
            {metrics.trend === "up" ? "Improving" : metrics.trend === "down" ? "Declining" : "Stable"}
          </span>
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalSent}</div>
            <p className="text-xs text-muted-foreground">Total outreach messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Responses</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalReplied}</div>
            <p className="text-xs text-muted-foreground">Candidates replied</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.responseRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalPending} pending responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.avgResponseTime
                ? `${metrics.avgResponseTime.toFixed(1)}h`
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">Time to first response</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Response Breakdown</CardTitle>
          <CardDescription>Distribution of message statuses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm">Replied</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{metrics.totalReplied}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalSent > 0 ? ((metrics.totalReplied / metrics.totalSent) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm">Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{metrics.totalPending}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalSent > 0 ? ((metrics.totalPending / metrics.totalSent) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-sm">No Response</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {metrics.totalSent - metrics.totalReplied - metrics.totalPending}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalSent > 0 ? (((metrics.totalSent - metrics.totalReplied - metrics.totalPending) / metrics.totalSent) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
          </div>

          {/* Visual progress bar */}
          <div className="mt-4 h-2 w-full bg-gray-200 rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 h-full"
              style={{
                width: `${metrics.totalSent > 0 ? (metrics.totalReplied / metrics.totalSent) * 100 : 0}%`,
              }}
            ></div>
            <div
              className="bg-yellow-500 h-full"
              style={{
                width: `${metrics.totalSent > 0 ? (metrics.totalPending / metrics.totalSent) * 100 : 0}%`,
              }}
            ></div>
            <div
              className="bg-gray-500 h-full"
              style={{
                width: `${metrics.totalSent > 0 ? ((metrics.totalSent - metrics.totalReplied - metrics.totalPending) / metrics.totalSent) * 100 : 0}%`,
              }}
            ></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
