import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  KeyRound,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  type AuditCategory,
  formatAuditActionLabel,
  getAuditCategory,
} from "@/lib/auditEvents";

type RiskFilter = "all" | "high" | "medium" | "low";

const auditCategories: Array<{
  value: AuditCategory;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { value: "all", label: "All", icon: ClipboardList },
  { value: "approval", label: "Approvals", icon: ShieldCheck },
  { value: "send", label: "Send attempts", icon: Send },
  { value: "response", label: "Responses", icon: CheckCircle2 },
  { value: "credential", label: "Credentials", icon: KeyRound },
  { value: "candidate", label: "Candidates", icon: UserCheck },
  { value: "campaign", label: "Campaigns", icon: ClipboardList },
  { value: "other", label: "Other", icon: ClipboardList },
];

const riskFilters: RiskFilter[] = ["all", "high", "medium", "low"];
const AUDIT_EVENT_LIMIT = 200;

export default function AuditLog() {
  const [campaignId, setCampaignId] = useState<string>("");
  const [category, setCategory] = useState<AuditCategory>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { data: campaigns } = trpc.campaigns.list.useQuery();

  useEffect(() => {
    if (!campaignId && campaigns?.[0]) {
      setCampaignId(String(campaigns[0].id));
    }
  }, [campaignId, campaigns]);

  const selectedCampaignId = campaignId ? Number(campaignId) : undefined;
  const normalizedSearch = searchTerm.trim();
  const { data: events, isLoading } = trpc.audit.getForCampaign.useQuery(
    {
      campaignId: selectedCampaignId || 0,
      limit: AUDIT_EVENT_LIMIT,
      riskLevel: riskFilter === "all" ? undefined : riskFilter,
      search: normalizedSearch || undefined,
    },
    { enabled: !!selectedCampaignId }
  );
  const eventList = events ?? [];
  const filteredEvents = useMemo(() => {
    return eventList.filter((event: any) => {
      const eventCategory = getAuditCategory(event);
      if (category !== "all" && eventCategory !== category) return false;
      return true;
    });
  }, [category, eventList]);
  const summary = useMemo(() => {
    return {
      total: eventList.length,
      high: eventList.filter((event: any) => event.riskLevel === "high").length,
      medium: eventList.filter((event: any) => event.riskLevel === "medium")
        .length,
      low: eventList.filter((event: any) => event.riskLevel === "low").length,
      sends: eventList.filter((event: any) => getAuditCategory(event) === "send")
        .length,
      approvals: eventList.filter(
        (event: any) => getAuditCategory(event) === "approval"
      ).length,
    };
  }, [eventList]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-gray-600 mt-1">
              Review approvals, send attempts, responses, credential events, and
              campaign decisions
            </p>
          </div>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns?.map((campaign: any) => (
                <SelectItem key={campaign.id} value={String(campaign.id)}>
                  {campaign.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <AuditSummaryCard label="Events" value={summary.total} />
          <AuditSummaryCard
            label="High risk"
            value={summary.high}
            tone={summary.high > 0 ? "danger" : "neutral"}
          />
          <AuditSummaryCard label="Approvals" value={summary.approvals} />
          <AuditSummaryCard label="Send events" value={summary.sends} />
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Search actions, entities, sources, or redacted details"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {riskFilters.map(risk => (
                  <Button
                    key={risk}
                    type="button"
                    variant={riskFilter === risk ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRiskFilter(risk)}
                    className="capitalize"
                  >
                    {risk}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-xs text-muted-foreground">
                Showing latest {AUDIT_EVENT_LIMIT} matching audit events. Search
                and risk filters are applied before loading results.
              </p>
              {auditCategories.map(item => {
                const Icon = item.icon;
                const count =
                  item.value === "all"
                    ? eventList.length
                    : eventList.filter(
                        (event: any) => getAuditCategory(event) === item.value
                      ).length;
                return (
                  <Button
                    key={item.value}
                    type="button"
                    variant={category === item.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategory(item.value)}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                    <Badge variant="secondary" className="ml-2">
                      {count}
                    </Badge>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading audit events...
            </CardContent>
          </Card>
        ) : !events || events.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No audit events for this campaign
              </h3>
              <p className="text-gray-600">
                Consequential campaign actions will appear here.
              </p>
            </CardContent>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No audit events match these filters
              </h3>
              <p className="text-gray-600">
                Clear search or switch category/risk filters to widen the
                review.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredEvents.map((event: any) => {
              const eventCategory = getAuditCategory(event);
              const categoryLabel =
                auditCategories.find(item => item.value === eventCategory)
                  ?.label ?? "Other";
              return (
              <Card key={event.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {formatAuditActionLabel(event.action)}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{categoryLabel}</Badge>
                        <Badge
                          variant={
                            event.riskLevel === "high"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {event.riskLevel}
                        </Badge>
                      </div>
                    </div>
                    {event.riskLevel === "high" && (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
                    <span>Actor: {event.actor}</span>
                    <span>
                      Entity: {event.entityType} #{event.entityId}
                    </span>
                    {event.source && <span>Source: {event.source}</span>}
                  </div>
                  {(event.beforeState || event.afterState) && (
                    <details className="rounded-md bg-muted p-3">
                      <summary className="cursor-pointer font-medium">
                        Details
                      </summary>
                      <pre className="mt-3 whitespace-pre-wrap text-xs">
                        {JSON.stringify(
                          {
                            before: parseJson(event.beforeState),
                            after: parseJson(event.afterState),
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function AuditSummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={
            tone === "danger"
              ? "text-2xl font-bold text-red-600"
              : "text-2xl font-bold text-gray-900"
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
