import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { getNextActionRoute } from "@/lib/nextActionRoutes";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Link as LinkIcon,
  MessageSquare,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { Link } from "wouter";

type ReadinessStatus = "ready" | "warning" | "blocked";
type ActionPriority = "high" | "medium" | "low";

const readinessVariant: Record<
  ReadinessStatus,
  "default" | "secondary" | "destructive"
> = {
  ready: "default",
  warning: "secondary",
  blocked: "destructive",
};

const priorityClass: Record<ActionPriority, string> = {
  high: "border-red-200 bg-red-50 text-red-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-slate-200 bg-slate-50 text-slate-900",
};

function sumBy<T>(items: T[] | undefined, read: (item: T) => number) {
  return (items ?? []).reduce((total, item) => total + read(item), 0);
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: typeof Target;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const { user } = useAuth();
  const { data: campaigns, isLoading: campaignsLoading } =
    trpc.campaigns.list.useQuery(undefined, {
      enabled: !!user,
    });
  const { data: operatingSummaries } =
    trpc.campaigns.listOperatingSummaries.useQuery(undefined, {
      enabled: !!user,
    });
  const { data: platforms } = trpc.platforms.list.useQuery();
  const { data: credentialStatus } =
    trpc.platformCredentials.getStatus.useQuery(undefined, {
      enabled: !!user,
    });
  const { data: queueHealth } = trpc.queue.getHealth.useQuery(
    { limit: 200 },
    { enabled: !!user }
  );

  const campaignList = campaigns ?? [];
  const summaryList = operatingSummaries ?? [];
  const operatingByCampaignId = new Map(
    summaryList.map((summary: any) => [summary.campaignId, summary])
  );

  const activeCampaigns = campaignList.filter(
    campaign => campaign.status === "active" || campaign.status === "scheduled"
  ).length;
  const readyCampaigns = summaryList.filter(
    (summary: any) => summary.readiness.status === "ready"
  ).length;
  const blockedCampaigns = summaryList.filter(
    (summary: any) => summary.readiness.status === "blocked"
  ).length;
  const warningCampaigns = summaryList.filter(
    (summary: any) => summary.readiness.status === "warning"
  ).length;
  const reviewQueue = sumBy(
    summaryList,
    (summary: any) => summary.summary.messagesQueued
  );
  const candidatesDiscovered = sumBy(
    summaryList,
    (summary: any) => summary.summary.candidatesDiscovered
  );
  const responsesReceived = sumBy(
    summaryList,
    (summary: any) => summary.summary.responsesReceived
  );
  const followUpsDue = sumBy(
    summaryList,
    (summary: any) => summary.summary.followUpsDue
  );
  const sendFailures = sumBy(
    summaryList,
    (summary: any) => summary.summary.sendAttemptsFailed
  );
  const rateLimitWarnings = summaryList.filter((summary: any) =>
    summary.readiness.checks?.some(
      (check: any) =>
        check.key === "rate-limit-safety" && check.status !== "pass"
    )
  ).length;
  const credentialWarnings =
    credentialStatus?.filter(
      (status: any) =>
        status.status === "error" || status.status === "unverified"
    ).length ?? 0;
  const accessReadyPlatforms =
    credentialStatus?.filter((status: any) =>
      ["connected", "public_only", "public_only_saved"].includes(status.status)
    ).length ?? 0;
  const queueHealthByName = new Map(
    (queueHealth?.queues ?? []).map((queue: any) => [queue.queueName, queue])
  );
  const messageQueueHealth = queueHealthByName.get("messages") as
    | any
    | undefined;
  const discoveryQueueHealth = queueHealthByName.get("discovery") as
    | any
    | undefined;
  const messageQueueStats = messageQueueHealth?.live;
  const discoveryQueueStats = discoveryQueueHealth?.live;
  const queueFailures = queueHealth?.totals.live.failed ?? 0;
  const queueWaiting = queueHealth?.totals.live.waiting ?? 0;
  const durableQueueFailures = queueHealth?.totals.durable.failed ?? 0;
  const durableQueueFailuresLast24h =
    queueHealth?.totals.durable.failedLast24h ?? 0;
  const lastDiscoveryAt =
    discoveryQueueHealth?.lastCompletedAt ?? discoveryQueueHealth?.lastActivityAt;
  const attentionCount =
    blockedCampaigns +
    warningCampaigns +
    reviewQueue +
    followUpsDue +
    sendFailures +
    credentialWarnings +
    rateLimitWarnings +
    queueFailures;

  const nextActions = summaryList
    .flatMap((summary: any) => {
      const campaign = campaignList.find(
        item => item.id === summary.campaignId
      );
      return (summary.nextActions ?? []).map((action: any) => ({
        ...action,
        campaignId: summary.campaignId,
        campaignTitle: campaign?.title ?? `Campaign ${summary.campaignId}`,
      }));
    })
    .filter(
      action =>
        action.label !== "No immediate blockers" ||
        blockedCampaigns + warningCampaigns + reviewQueue + sendFailures === 0
    )
    .slice(0, 6);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Outreach Command Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Campaign readiness, review work, platform access, and queue
              health.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/campaigns">Campaigns</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/messages">Review messages</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Active campaigns"
            value={activeCampaigns}
            detail={`${readyCampaigns} ready, ${blockedCampaigns} blocked`}
            icon={Target}
          />
          <StatCard
            label="Needs review"
            value={reviewQueue}
            detail="Queued messages awaiting approval"
            icon={MessageSquare}
          />
          <StatCard
            label="Candidates"
            value={candidatesDiscovered}
            detail="Discovered across campaign ledgers"
            icon={Users}
          />
          <StatCard
            label="Responses"
            value={responsesReceived}
            detail={`${followUpsDue} follow-up${followUpsDue === 1 ? "" : "s"} due`}
            icon={Inbox}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Needs Attention
              </CardTitle>
              <CardDescription>
                Operational blockers and approval work across all campaigns.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {attentionCount === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border bg-green-50 p-3 text-green-900">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm">
                    No blockers, failed sends, credential warnings, or due
                    follow-ups are currently recorded.
                  </span>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <AttentionItem
                    label="Blocked campaigns"
                    value={blockedCampaigns}
                    href="/campaigns"
                  />
                  <AttentionItem
                    label="Campaign warnings"
                    value={warningCampaigns}
                    href="/campaigns"
                  />
                  <AttentionItem
                    label="Send failures"
                    value={sendFailures}
                    href="/messages"
                  />
                  <AttentionItem
                    label="Follow-ups due"
                    value={followUpsDue}
                    href="/follow-ups"
                  />
                  <AttentionItem
                    label="Credential warnings"
                    value={credentialWarnings}
                    href="/platforms"
                  />
                  <AttentionItem
                    label="Rate-limit warnings"
                    value={rateLimitWarnings}
                    href="/campaigns"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-700" />
                Platform Access
              </CardTitle>
              <CardDescription>
                Credential and public-search readiness.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-semibold">
                    {accessReadyPlatforms}
                    <span className="text-base font-normal text-muted-foreground">
                      /{platforms?.length ?? 0}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Platforms ready for discovery or verified access
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/platforms">Review</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {(credentialStatus ?? []).slice(0, 5).map((status: any) => (
                  <div
                    key={status.platform.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
                  >
                    <span className="truncate">{status.platform.name}</span>
                    <Badge
                      variant={
                        status.status === "error"
                          ? "destructive"
                          : status.status === "connected"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {status.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-slate-700" />
                Next Actions
              </CardTitle>
              <CardDescription>
                The most relevant ledger actions across active campaigns.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaignsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading campaign ledger...
                </p>
              ) : nextActions.length === 0 ? (
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  No campaigns yet. Create a campaign to start building the
                  outreach ledger.
                </div>
              ) : (
                nextActions.map((action: any, index) => {
                  const route = getNextActionRoute(action, action.campaignId);
                  return (
                    <Link
                      key={`${action.campaignId}-${action.label}-${index}`}
                      href={route.href}
                      className={`block rounded-lg border p-3 transition-colors hover:bg-accent ${priorityClass[action.priority as ActionPriority]}`}
                      data-testid={`home-next-action-${index}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{action.label}</p>
                          <p className="mt-1 text-sm">{action.detail}</p>
                          <p className="mt-2 text-xs font-medium underline-offset-4">
                            {route.cta}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {action.campaignTitle}
                        </Badge>
                      </div>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-slate-700" />
                Queue Health
              </CardTitle>
              <CardDescription>
                Live queue state plus recent durable ledger activity.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <QueueLine
                label="Message queue"
                waiting={messageQueueStats?.waiting ?? 0}
                active={messageQueueStats?.active ?? 0}
                failed={messageQueueStats?.failed ?? 0}
                recentRecords={messageQueueHealth?.durable.recentRecords ?? 0}
                lastActivityAt={messageQueueHealth?.lastActivityAt}
              />
              <QueueLine
                label="Discovery queue"
                waiting={discoveryQueueStats?.waiting ?? 0}
                active={discoveryQueueStats?.active ?? 0}
                failed={discoveryQueueStats?.failed ?? 0}
                recentRecords={discoveryQueueHealth?.durable.recentRecords ?? 0}
                lastActivityAt={discoveryQueueHealth?.lastActivityAt}
              />
              <div className="grid gap-2 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Last discovery activity
                  </p>
                  <p className="font-medium">
                    {formatOptionalDate(lastDiscoveryAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Recent durable errors
                  </p>
                  <p className="font-medium">
                    {durableQueueFailures} total,{" "}
                    {durableQueueFailuresLast24h} in 24h
                  </p>
                </div>
              </div>
              {queueHealth?.queues
                .flatMap((queue: any) =>
                  (queue.recentErrors ?? []).map((error: any) => ({
                    ...error,
                    queueName: queue.queueName,
                  }))
                )
                .slice(0, 2)
                .map((error: any) => (
                  <div
                    key={`${error.queueName}-${error.id}`}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{error.queueName}</Badge>
                      <span className="font-medium">{error.jobType}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatOptionalDate(error.failedAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2">{error.errorMessage}</p>
                  </div>
                ))}
              <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3 text-sm">
                <span>
                  {queueWaiting} waiting, {queueFailures} failed
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/queue">Open queue</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Readiness</CardTitle>
            <CardDescription>
              Current readiness and operating summary by campaign.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {campaignList.length === 0 ? (
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  No campaigns configured yet.
                </p>
                <Button asChild>
                  <Link href="/campaigns">Create campaign</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {campaignList.slice(0, 6).map(campaign => {
                  const operating = operatingByCampaignId.get(campaign.id) as
                    | any
                    | undefined;
                  const readiness = operating?.readiness.status ?? "warning";
                  return (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="grid gap-3 p-3 transition-colors hover:bg-accent md:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{campaign.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {campaign.status}
                        </p>
                      </div>
                      <Badge
                        className="w-fit"
                        variant={
                          readinessVariant[readiness as ReadinessStatus] ??
                          "secondary"
                        }
                      >
                        {readiness}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {operating?.summary.candidatesDiscovered ?? 0}{" "}
                        candidates
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {operating?.summary.messagesQueued ?? 0} review
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function formatOptionalDate(value: string | Date | null | undefined) {
  if (!value) return "No activity recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function AttentionItem({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
    >
      <span>{label}</span>
      <Badge variant={value > 0 ? "destructive" : "secondary"}>{value}</Badge>
    </Link>
  );
}

function QueueLine({
  label,
  waiting,
  active,
  failed,
  recentRecords,
  lastActivityAt,
}: {
  label: string;
  waiting: number;
  active: number;
  failed: number;
  recentRecords: number;
  lastActivityAt?: string | Date | null;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <Badge variant={failed > 0 ? "destructive" : "secondary"}>
          {failed > 0 ? "attention" : "idle"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <p className="font-semibold">{waiting}</p>
          <p className="text-xs text-muted-foreground">waiting</p>
        </div>
        <div>
          <p className="font-semibold">{active}</p>
          <p className="text-xs text-muted-foreground">active</p>
        </div>
        <div>
          <p className="font-semibold">{failed}</p>
          <p className="text-xs text-muted-foreground">failed</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{recentRecords} durable records</span>
        <span>Last: {formatOptionalDate(lastActivityAt)}</span>
      </div>
    </div>
  );
}
