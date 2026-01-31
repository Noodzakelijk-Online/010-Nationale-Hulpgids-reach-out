import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Repeat, Play, Pause, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function ScheduledCampaigns() {
  const { data: campaigns, refetch } = trpc.campaigns.list.useQuery();
  const pauseCampaign = trpc.campaigns.pause.useMutation();
  const resumeCampaign = trpc.campaigns.resume.useMutation();

  const scheduledCampaigns = campaigns?.filter((c: any) => c.isScheduled === 1 && (c.status === "scheduled" || c.status === "paused"));
  
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
    if (!pattern) return "One-time";
    return pattern.charAt(0).toUpperCase() + pattern.slice(1);
  };

  return (
    <DashboardLayout>
      <div className="container py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Scheduled Campaigns</h1>
            <p className="text-muted-foreground">
              Manage campaigns scheduled for automatic execution
            </p>
          </div>
          <Button className="bg-gradient-to-r from-purple-600 to-blue-600">
            <Plus className="h-4 w-4 mr-2" />
            Schedule New Campaign
          </Button>
        </div>

        {scheduledCampaigns && scheduledCampaigns.length > 0 ? (
          <div className="grid gap-6">
            {scheduledCampaigns.map((campaign: any) => (
              <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle className="text-2xl mb-2">{campaign.title}</CardTitle>
                      <CardDescription className="text-base">{campaign.description}</CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                      {campaign.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Schedule Info */}
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-purple-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Next Execution</p>
                          <p className="text-sm text-gray-600">{formatDate(campaign.nextExecutionAt)}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Repeat className="h-5 w-5 text-blue-600 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Recurrence</p>
                          <p className="text-sm text-gray-600">
                            {campaign.isRecurring === 1 
                              ? getRecurringLabel(campaign.recurringPattern)
                              : "One-time execution"}
                          </p>
                        </div>
                      </div>
                      {campaign.lastExecutedAt && (
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-green-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Last Executed</p>
                            <p className="text-sm text-gray-600">{formatDate(campaign.lastExecutedAt)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Campaign Stats */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">{campaign.totalCandidates}</p>
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
                      <div className="flex gap-2 pt-2">
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
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
                <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">No Scheduled Campaigns</h3>
                <p className="text-muted-foreground mb-6">
                  Schedule campaigns to run automatically at optimal times
                </p>
                <Button className="bg-gradient-to-r from-purple-600 to-blue-600">
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Your First Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Optimal Timing Guide */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Optimal Timing Guide
            </CardTitle>
            <CardDescription>Best times to reach out to candidates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-2">Weekday Mornings</h4>
                <p className="text-sm text-green-700">
                  9:00 AM - 11:00 AM on Monday-Friday typically sees the highest response rates
                </p>
              </div>
              <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">Tuesday-Thursday</h4>
                <p className="text-sm text-blue-700">
                  Mid-week days show better engagement than Mondays or Fridays
                </p>
              </div>
              <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-lg">
                <h4 className="font-semibold text-purple-900 mb-2">Avoid Weekends</h4>
                <p className="text-sm text-purple-700">
                  Professional outreach on weekends typically has lower open and response rates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
