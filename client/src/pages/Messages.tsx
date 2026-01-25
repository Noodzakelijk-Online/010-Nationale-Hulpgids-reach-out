import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  MessageSquare,
  Check,
  X,
  Edit,
  Send,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  User,
  Building,
} from "lucide-react";
import { toast } from "sonner";

export default function Messages() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editedSubject, setEditedSubject] = useState("");
  const [editedContent, setEditedContent] = useState("");

  // Fetch all campaigns for filter dropdown
  const { data: campaigns } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Fetch all messages (we'll need to create this endpoint)
  const { data: messages, isLoading, refetch } = trpc.messages.listAll.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      campaignId: campaignFilter === "all" ? undefined : parseInt(campaignFilter),
    },
    {
      enabled: !!user,
    }
  );

  const updateMessageStatus = trpc.messages.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Message status updated");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const updateMessage = trpc.messages.update.useMutation({
    onSuccess: () => {
      toast.success("Message updated successfully");
      setEditingMessage(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const bulkApprove = trpc.messages.bulkUpdateStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.updated} messages approved`);
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const handleApprove = (messageId: number) => {
    updateMessageStatus.mutate({ messageId, status: "approved" });
  };

  const handleReject = (messageId: number) => {
    updateMessageStatus.mutate({ messageId, status: "rejected" });
  };

  const handleEdit = (message: any) => {
    setEditingMessage(message);
    setEditedSubject(message.subject);
    setEditedContent(message.content);
  };

  const handleSaveEdit = () => {
    if (!editingMessage) return;
    updateMessage.mutate({
      messageId: editingMessage.id,
      subject: editedSubject,
      content: editedContent,
    });
  };

  const handleBulkApprove = () => {
    const queuedMessageIds = messages
      ?.filter((m) => m.status === "queued")
      .map((m) => m.id) || [];
    
    if (queuedMessageIds.length === 0) {
      toast.error("No queued messages to approve");
      return;
    }

    bulkApprove.mutate({
      messageIds: queuedMessageIds,
      status: "approved",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4" />;
      case "approved":
        return <CheckCircle2 className="h-4 w-4" />;
      case "sent":
        return <Send className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "replied":
        return <Mail className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "queued":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-blue-100 text-blue-800";
      case "sent":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "replied":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading messages...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const queuedCount = messages?.filter((m) => m.status === "queued").length || 0;
  const approvedCount = messages?.filter((m) => m.status === "approved").length || 0;
  const sentCount = messages?.filter((m) => m.status === "sent").length || 0;
  const repliedCount = messages?.filter((m) => m.status === "replied").length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
            <p className="text-muted-foreground mt-1">
              Review, edit, and approve outreach messages
            </p>
          </div>
          {queuedCount > 0 && (
            <Button
              onClick={handleBulkApprove}
              className="bg-gradient-to-r from-green-600 to-emerald-600"
              disabled={bulkApprove.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve All Queued ({queuedCount})
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Queued</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queuedCount}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{approvedCount}</div>
              <p className="text-xs text-muted-foreground">Ready to send</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sent</CardTitle>
              <Send className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sentCount}</div>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Replied</CardTitle>
              <Mail className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{repliedCount}</div>
              <p className="text-xs text-muted-foreground">Responses received</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="replied">Replied</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns?.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id.toString()}>
                        {campaign.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Messages List */}
        {!messages || messages.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No messages found</h3>
              <p className="text-muted-foreground text-center max-w-md">
                {statusFilter !== "all" || campaignFilter !== "all"
                  ? "Try adjusting your filters to see more messages."
                  : "Start a campaign with automated messaging enabled to see messages here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <Card key={message.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusColor(message.status)}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(message.status)}
                            {message.status}
                          </span>
                        </Badge>
                        <Badge variant="outline">
                          <Building className="h-3 w-3 mr-1" />
                          {message.platform?.name || "Unknown Platform"}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{message.subject}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <User className="h-4 w-4" />
                        To: {message.candidate?.name || "Unknown"}
                        {message.candidate?.location && ` • ${message.candidate.location}`}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {message.status === "queued" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(message)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleApprove(message.id)}
                            disabled={updateMessageStatus.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleReject(message.id)}
                            disabled={updateMessageStatus.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded-lg p-4">
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {message.candidate && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        <strong>Compatibility Score:</strong> {message.candidate.compatibilityScore}%
                        {message.candidate.experience && (
                          <> • <strong>Experience:</strong> {message.candidate.experience}</>
                        )}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Message Dialog */}
        <Dialog open={!!editingMessage} onOpenChange={() => setEditingMessage(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Message</DialogTitle>
              <DialogDescription>
                Make changes to the message before approving it for sending
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={editedSubject}
                  onChange={(e) => setEditedSubject(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Message Content</Label>
                <Textarea
                  id="content"
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMessage(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateMessage.isPending}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
