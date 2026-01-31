import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Plus, Target, Users, MessageSquare, TrendingUp, ArrowLeft, 
  Calendar, Clock, Repeat, Play, Pause, Trash2, Activity, CheckCircle2, XCircle, Loader2 
} from "lucide-react";
import { Link } from "wouter";
import { CampaignWizard } from "@/components/CampaignWizard";
import { toast } from "sonner";

export default function Campaigns() {
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<number | null>(null);
  const [queueFilter, setQueueFilter] = useState<"messages" | "discovery">("messages");
  const [jobStatus, setJobStatus] = useState<"waiting" | "active" | "completed" | "failed" | "delayed" | undefined>();
  
  const { user, loading: authLoading } = useAuth();
  const { data: campaigns, isLoading, refetch } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });
  const deleteCampaign = trpc.campaigns.delete.useMutation();
  const pauseCampaign = trpc.campaigns.pause.useMutation();
  const resumeCampaign = trpc.campaigns.resume.useMutation();
  const { data: queueStats } = trpc.queue.getStats.useQuery({ queueName: queueFilter }, {
    refetchInterval: 3000, // Auto-refresh every 3 seconds
  });
  const { data: jobs } = trpc.queue.getJobs.useQuery({
    queueName: queueFilter,
    status: jobStatus,
    start: 0,
    end: 49,
  }, {
    refetchInterval: 3000,
  });

  const activeCampaigns = campaigns?.filter((c: any) => c.status === "active" || c.status === "draft");
  const scheduledCampaigns = campaigns?.filter((c: any) => c.isScheduled === 1 && (c.status === "scheduled" || c.status === "paused"));

  const handleDelete = async () => {
    if (!campaignToDelete) return;
    
    try {
      await deleteCampaign.mutateAsync({ id: campaignToDelete });
      toast.success("Campaign deleted successfully");
      refetch();
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    } catch (error) {
      toast.error("Failed to delete campaign");
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

  if (showWizard) {
    return (
      <DashboardLayout>
        <div className="p-2">
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
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Campaign Management</h1>
            <p className="text-gray-600 mt-1">Manage your outreach campaigns, schedules, and queue status</p>
          </div>
          <Button onClick={() => setShowWizard(true)} className="bg-gradient-to-r from-purple-600 to-blue-600">
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
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
          </TabsList>

          {/* Active Campaigns Tab */}
          <TabsContent value="active" className="space-y-4">
            {activeCampaigns && activeCampaigns.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeCampaigns.map((campaign: any) => (
                  <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{campaign.title}</CardTitle>
                          <CardDescription className="mt-1">{campaign.description}</CardDescription>
                        </div>
                        <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                          {campaign.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">{campaign.candidatesFound}</p>
                            <p className="text-xs text-gray-600">Candidates</p>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{campaign.messagesSent}</p>
                            <p className="text-xs text-gray-600">Messages</p>
                          </div>
                          <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <p className="text-2xl font-bold text-purple-600">{campaign.responsesReceived}</p>
                            <p className="text-xs text-gray-600">Responses</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Link href={`/campaigns/${campaign.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full">
                              View Details
                            </Button>
                          </Link>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              setCampaignToDelete(campaign.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
                    <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Campaigns</h3>
                    <p className="text-gray-600 mb-6">Create your first campaign to start reaching out to candidates</p>
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
                  <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg text-gray-900">{campaign.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">{campaign.description}</p>
                          </div>
                          <Badge variant={campaign.status === "paused" ? "secondary" : "default"}>
                            {campaign.status}
                          </Badge>
                        </div>

                        {/* Schedule Info */}
                        <div className="space-y-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-gray-700">Next Run:</span>
                            <span className="text-gray-900">{formatDate(campaign.nextExecutionAt)}</span>
                          </div>
                          {campaign.isRecurring === 1 && (
                            <div className="flex items-center gap-2 text-sm">
                              <Repeat className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-gray-700">Pattern:</span>
                              <span className="text-gray-900">{getRecurringLabel(campaign.recurringPattern)}</span>
                            </div>
                          )}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-3 bg-blue-50 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">{campaign.candidatesFound}</p>
                            <p className="text-xs text-gray-600">Candidates</p>
                          </div>
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">{campaign.messagesSent}</p>
                            <p className="text-xs text-gray-600">Messages</p>
                          </div>
                          <div className="text-center p-3 bg-purple-50 rounded-lg">
                            <p className="text-2xl font-bold text-purple-600">{campaign.responsesReceived}</p>
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
                              setCampaignToDelete(campaign.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Scheduled Campaigns</h3>
                    <p className="text-gray-600 mb-6">Schedule campaigns to run automatically at specific times</p>
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
                      <p className="text-3xl font-bold text-blue-600">{queueStats.waiting}</p>
                      <p className="text-sm text-gray-600 mt-1">Waiting</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Activity className="h-8 w-8 text-purple-600 mx-auto mb-2 animate-pulse" />
                      <p className="text-3xl font-bold text-purple-600">{queueStats.active}</p>
                      <p className="text-sm text-gray-600 mt-1">Active</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-green-600">{queueStats.completed}</p>
                      <p className="text-sm text-gray-600 mt-1">Completed</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-red-600">{queueStats.failed}</p>
                      <p className="text-sm text-gray-600 mt-1">Failed</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-orange-600">{queueStats.delayed}</p>
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
                <CardDescription>Recent jobs in the {queueFilter} queue</CardDescription>
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
                  {["waiting", "active", "completed", "failed", "delayed"].map((status) => (
                    <Button
                      key={status}
                      variant={jobStatus === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => setJobStatus(status as any)}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>

                {/* Jobs Table */}
                {jobs && jobs.length > 0 ? (
                  <div className="space-y-2">
                    {jobs.map((job: any) => (
                      <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              job.status === "completed" ? "default" :
                              job.status === "failed" ? "destructive" :
                              job.status === "active" ? "secondary" : "outline"
                            }>
                              {job.status}
                            </Badge>
                            <span className="font-medium text-sm">Job #{job.id}</span>
                          </div>
                          {job.error && (
                            <p className="text-xs text-red-600 mt-1">{job.error}</p>
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
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Campaign?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the campaign and all associated candidates and messages.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCampaignToDelete(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteCampaign.isPending}
              >
                {deleteCampaign.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
