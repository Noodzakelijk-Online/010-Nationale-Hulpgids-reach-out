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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Link as LinkIcon,
  Loader2,
  TestTube2,
  AlertCircle,
  History,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatCredentialEventTime(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

function getCredentialEventLabel(event: any) {
  const eventType =
    typeof event?.eventType === "string"
      ? event.eventType.replaceAll("_", " ")
      : "event";
  const status = typeof event?.status === "string" ? event.status : "unknown";
  return `${eventType} - ${status}`;
}

export default function PlatformConnections() {
  const { user } = useAuth();
  const { data: platforms, isLoading: platformsLoading } =
    trpc.platforms.list.useQuery();
  const { data: credentials, isLoading: credentialsLoading } =
    trpc.platformCredentials.list.useQuery(undefined, {
      enabled: !!user,
    });
  const { data: credentialStatus } =
    trpc.platformCredentials.getStatus.useQuery(undefined, {
      enabled: !!user,
    });
  const utils = trpc.useUtils();
  const saveCredentials = trpc.platformCredentials.save.useMutation();
  const testConnection = trpc.platformCredentials.testConnection.useMutation();

  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null);
  const [credentialDrafts, setCredentialDrafts] = useState<
    Record<number, { email: string; password: string }>
  >({});
  const [testResults, setTestResults] = useState<
    Record<number, { success: boolean; message: string }>
  >({});

  const handleConnect = async (platformId: number) => {
    const draft = credentialDrafts[platformId] ?? { email: "", password: "" };
    const email = draft.email.trim();
    const password = draft.password;

    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }

    try {
      await saveCredentials.mutateAsync({
        platformId,
        email,
        password,
      });
      await Promise.all([
        utils.platformCredentials.list.invalidate(),
        utils.platformCredentials.getStatus.invalidate(),
      ]);
      toast.success("Credentials saved. Run a connection test before launch.");
      clearCredentialDraft(platformId);
      setSelectedPlatform(null);
    } catch (error) {
      toast.error("Failed to save credentials");
    }
  };

  const updateCredentialDraft = (
    platformId: number,
    field: "email" | "password",
    value: string
  ) => {
    setCredentialDrafts(previous => ({
      ...previous,
      [platformId]: {
        email: previous[platformId]?.email ?? "",
        password: previous[platformId]?.password ?? "",
        [field]: value,
      },
    }));
  };

  const clearCredentialDraft = (platformId: number) => {
    setCredentialDrafts(previous => {
      const { [platformId]: _cleared, ...remaining } = previous;
      return remaining;
    });
  };

  const openCredentialForm = (
    platformId: number,
    existingEmail?: string | null
  ) => {
    const previousSelectedPlatform = selectedPlatform;
    setSelectedPlatform(platformId);
    setCredentialDrafts(previous => {
      const next = { ...previous };
      if (
        previousSelectedPlatform !== null &&
        previousSelectedPlatform !== platformId
      ) {
        delete next[previousSelectedPlatform];
      }
      if (next[platformId]) return next;
      return {
        ...next,
        [platformId]: {
          email: existingEmail ?? "",
          password: "",
        },
      };
    });
  };

  const openAccessNotes = (platformId: number) => {
    if (selectedPlatform !== null && selectedPlatform !== platformId) {
      clearCredentialDraft(selectedPlatform);
    }
    setSelectedPlatform(platformId);
  };

  const isConnected = (platformId: number) => {
    return !!credentials?.some(
      c => c.platformId === platformId && c.isConnected === 1
    );
  };

  const getPlatformStatus = (platformId: number) => {
    return credentialStatus?.find(
      (status: any) => status.platform.id === platformId
    );
  };

  const getStatusLabel = (status: any, connected: boolean) => {
    if (status?.status === "public_only") return "Public search only";
    if (status?.status === "public_only_saved") return "Public search only";
    if (status?.status === "error") return "Credential error";
    if (connected) return "Verified";
    if (status?.status === "unverified") return "Saved, test required";
    return "Not configured";
  };

  const getStatusBadgeVariant = (status: any, connected: boolean) => {
    if (connected) return "default";
    if (status?.status === "error") return "destructive";
    return "secondary";
  };

  if (platformsLoading || credentialsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading platforms...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Platform Connections
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure verified account access where supported. Public-only
            platforms can still be used for discovery without storing
            credentials.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {platforms?.map(platform => {
            const connected = isConnected(platform.id);
            const status = getPlatformStatus(platform.id);
            const isSelected = selectedPlatform === platform.id;
            const existingCredential = credentials?.find(
              credential => credential.platformId === platform.id
            );
            const draft = credentialDrafts[platform.id] ?? {
              email: existingCredential?.email ?? "",
              password: "",
            };
            const statusLabel = getStatusLabel(status, connected);
            const publicOnly = status?.capability?.mode === "public_only";
            const recentCredentialEvents =
              status?.recentEvents ??
              (status?.latestEvent ? [status.latestEvent] : []);
            const cardTone = connected
              ? "border-green-200 bg-gradient-to-br from-green-50 to-white"
              : publicOnly
                ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
                : "border-gray-200";
            const iconTone = connected
              ? "bg-green-100"
              : publicOnly
                ? "bg-blue-100"
                : "bg-gray-100";
            const iconColor = connected
              ? "text-green-600"
              : publicOnly
                ? "text-blue-600"
                : "text-gray-400";

            return (
              <Card
                key={platform.id}
                className={`min-w-0 transition-all hover:shadow-xl ${isSelected ? "ring-2 ring-purple-500 shadow-lg" : ""} ${cardTone}`}
              >
                <CardHeader>
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex min-w-0 items-center gap-3 text-lg">
                        <div className={`p-2 rounded-lg ${iconTone}`}>
                          <LinkIcon className={`h-5 w-5 ${iconColor}`} />
                        </div>
                        <span className="min-w-0 break-words">
                          {platform.name}
                        </span>
                        {connected && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                      </CardTitle>
                      <CardDescription className="mt-2 break-all text-sm sm:ml-12">
                        {platform.baseUrl}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={getStatusBadgeVariant(status, connected)}
                      className={`w-fit max-w-full whitespace-normal break-words text-left ${connected ? "bg-green-500" : ""}`}
                    >
                      {statusLabel}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {status && (
                    <div className="mb-4 rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-medium">Credential health</span>
                        <Badge
                          className="w-fit max-w-full whitespace-normal break-all text-left"
                          variant={
                            status.status === "connected"
                              ? "default"
                              : status.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {status.status}
                        </Badge>
                      </div>
                      {status.credential?.lastSyncAt && (
                        <p className="text-muted-foreground">
                          Last sync:{" "}
                          {new Date(
                            status.credential.lastSyncAt
                          ).toLocaleString()}
                        </p>
                      )}
                      {status.credential?.lastError && (
                        <p className="text-red-700">
                          Last error: {status.credential.lastError}
                        </p>
                      )}
                      {recentCredentialEvents.length > 0 && (
                        <div className="pt-2">
                          <div className="mb-2 flex items-center gap-2 font-medium text-gray-900">
                            <History className="h-4 w-4 text-muted-foreground" />
                            <span>Recent connection history</span>
                          </div>
                          <div className="space-y-2">
                            {recentCredentialEvents.map((event: any) => {
                              const eventTime = formatCredentialEventTime(
                                event.createdAt
                              );
                              return (
                                <div
                                  key={
                                    event.id ??
                                    `${event.eventType}-${event.createdAt}`
                                  }
                                  className="rounded-md border bg-white p-2"
                                >
                                  <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <span className="break-words font-medium text-gray-800">
                                      {getCredentialEventLabel(event)}
                                    </span>
                                    {eventTime && (
                                      <span className="text-xs text-muted-foreground">
                                        {eventTime}
                                      </span>
                                    )}
                                  </div>
                                  {event.message && (
                                    <p className="mt-1 break-words text-xs text-muted-foreground">
                                      {event.message}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {publicOnly && (
                        <p className="text-blue-700">
                          Authenticated automation is unavailable for this
                          platform. Discovery uses public listings only.
                        </p>
                      )}
                    </div>
                  )}
                  {isSelected && publicOnly ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-5 w-5" />
                          <p>
                            No credential connection is required for the current
                            integration. Candidate discovery can run against
                            public listings; sending still requires approval and
                            manual delivery evidence.
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setSelectedPlatform(null)}
                      >
                        Close
                      </Button>
                    </div>
                  ) : isSelected ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`email-${platform.id}`}>Email</Label>
                        <Input
                          id={`email-${platform.id}`}
                          type="email"
                          placeholder="your@email.com"
                          value={draft.email}
                          onChange={e =>
                            updateCredentialDraft(
                              platform.id,
                              "email",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`password-${platform.id}`}>
                          Password
                        </Label>
                        <Input
                          id={`password-${platform.id}`}
                          type="password"
                          placeholder="••••••••"
                          value={draft.password}
                          onChange={e =>
                            updateCredentialDraft(
                              platform.id,
                              "password",
                              e.target.value
                            )
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const email = draft.email.trim();
                            const password = draft.password;
                            if (!email || !password) {
                              toast.error("Please enter credentials first");
                              return;
                            }
                            try {
                              const result = await testConnection.mutateAsync({
                                platformId: platform.id,
                                email,
                                password,
                              });
                              await Promise.all([
                                utils.platformCredentials.list.invalidate(),
                                utils.platformCredentials.getStatus.invalidate(),
                              ]);
                              setTestResults({
                                ...testResults,
                                [platform.id]: {
                                  success: result.success,
                                  message: result.message,
                                },
                              });
                              if (result.success) {
                                toast.success("Connection test successful!");
                              } else {
                                toast.error(result.message);
                              }
                            } catch {
                              toast.error(
                                "Connection test failed. Please check the credentials and try again."
                              );
                              setTestResults({
                                ...testResults,
                                [platform.id]: {
                                  success: false,
                                  message:
                                    "Connection test failed. Please check the credentials and try again.",
                                },
                              });
                            }
                          }}
                          disabled={testConnection.isPending}
                        >
                          {testConnection.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Testing...
                            </>
                          ) : (
                            <>
                              <TestTube2 className="mr-2 h-4 w-4" />
                              Test
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleConnect(platform.id)}
                          disabled={saveCredentials.isPending}
                          className="flex-1"
                        >
                          {saveCredentials.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <LinkIcon className="mr-2 h-4 w-4" />
                              Save credentials
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            clearCredentialDraft(platform.id);
                            setSelectedPlatform(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {testResults[platform.id] && (
                        <div
                          className={`p-3 rounded-lg border-2 ${testResults[platform.id].success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
                        >
                          <div className="flex items-start gap-2">
                            {testResults[platform.id].success ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                            )}
                            <div className="flex-1">
                              <p
                                className={`text-sm font-medium ${testResults[platform.id].success ? "text-green-900" : "text-red-900"}`}
                              >
                                {testResults[platform.id].success
                                  ? "Connection Successful"
                                  : "Connection Failed"}
                              </p>
                              <p
                                className={`text-xs mt-1 ${testResults[platform.id].success ? "text-green-700" : "text-red-700"}`}
                              >
                                {testResults[platform.id].message}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant={connected || publicOnly ? "outline" : "default"}
                      className="w-full"
                      onClick={() =>
                        publicOnly
                          ? openAccessNotes(platform.id)
                          : openCredentialForm(
                              platform.id,
                              existingCredential?.email
                            )
                      }
                    >
                      {publicOnly
                        ? "View Access Notes"
                        : connected
                          ? "Update Connection"
                          : "Save Credentials"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
