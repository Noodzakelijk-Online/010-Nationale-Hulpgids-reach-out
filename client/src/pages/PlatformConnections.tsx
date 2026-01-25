import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, XCircle, Link as LinkIcon, Loader2, TestTube2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function PlatformConnections() {
  const { user } = useAuth();
  const { data: platforms, isLoading: platformsLoading } = trpc.platforms.list.useQuery();
  const { data: credentials, isLoading: credentialsLoading } = trpc.platformCredentials.list.useQuery(undefined, {
    enabled: !!user,
  });
  const saveCredentials = trpc.platformCredentials.save.useMutation();
  const testConnection = trpc.platformCredentials.testConnection.useMutation();

  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({});

  const handleConnect = async (platformId: number) => {
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
      toast.success("Platform credentials saved successfully");
      setEmail("");
      setPassword("");
      setSelectedPlatform(null);
    } catch (error) {
      toast.error("Failed to save credentials");
    }
  };

  const isConnected = (platformId: number) => {
    return credentials?.some((c) => c.platformId === platformId && c.isConnected === 1);
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
          <h1 className="text-3xl font-bold tracking-tight">Platform Connections</h1>
          <p className="text-muted-foreground mt-1">
            Connect your accounts to enable automated outreach across multiple platforms
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {platforms?.map((platform) => {
            const connected = isConnected(platform.id);
            const isSelected = selectedPlatform === platform.id;

            return (
              <Card key={platform.id} className={`transition-all hover:shadow-xl ${isSelected ? "ring-2 ring-purple-500 shadow-lg" : ""} ${connected ? "border-green-200 bg-gradient-to-br from-green-50 to-white" : "border-gray-200"}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-3 text-lg">
                        <div className={`p-2 rounded-lg ${connected ? "bg-green-100" : "bg-gray-100"}`}>
                          <LinkIcon className={`h-5 w-5 ${connected ? "text-green-600" : "text-gray-400"}`} />
                        </div>
                        <span>{platform.name}</span>
                        {connected && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                      </CardTitle>
                      <CardDescription className="mt-2 ml-12 text-sm">{platform.baseUrl}</CardDescription>
                    </div>
                    <Badge variant={connected ? "default" : "secondary"} className={connected ? "bg-green-500" : ""}>
                      {connected ? "Connected" : "Not Connected"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {isSelected ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor={`email-${platform.id}`}>Email</Label>
                        <Input
                          id={`email-${platform.id}`}
                          type="email"
                          placeholder="your@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`password-${platform.id}`}>Password</Label>
                        <Input
                          id={`password-${platform.id}`}
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
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
                            } catch (error: any) {
                              toast.error(`Test failed: ${error.message}`);
                              setTestResults({
                                ...testResults,
                                [platform.id]: {
                                  success: false,
                                  message: error.message,
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
                              Connecting...
                            </>
                          ) : (
                            <>
                              <LinkIcon className="mr-2 h-4 w-4" />
                              Connect
                            </>
                          )}
                        </Button>
                        <Button variant="outline" onClick={() => setSelectedPlatform(null)}>
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
                              <p className={`text-sm font-medium ${testResults[platform.id].success ? "text-green-900" : "text-red-900"}`}>
                                {testResults[platform.id].success ? "Connection Successful" : "Connection Failed"}
                              </p>
                              <p className={`text-xs mt-1 ${testResults[platform.id].success ? "text-green-700" : "text-red-700"}`}>
                                {testResults[platform.id].message}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant={connected ? "outline" : "default"}
                      className="w-full"
                      onClick={() => setSelectedPlatform(platform.id)}
                    >
                      {connected ? "Update Connection" : "Connect Platform"}
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
