import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface CampaignWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface CampaignData {
  title: string;
  description: string;
  selectedPlatforms: number[];
  location: string;
  experience: string;
  services: string;
  minBudget: string;
  maxBudget: string;
  compatibilityThreshold: number;
  maxCandidates: number;
  autoSendMessages: boolean;
  isScheduled: boolean;
  scheduledFor: string;
  isRecurring: boolean;
  recurringPattern: string;
  dailySendLimit: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  operationMode: CampaignOperationMode;
  messageTonePreset: MessageTonePreset;
  messageTemplateSnippet: string;
}

type CampaignOperationMode = "dry_run" | "reviewed_outreach";
type MessageTonePreset = "careful" | "warm" | "concise";

const operationModeOptions: Array<{
  value: CampaignOperationMode;
  label: string;
  description: string;
}> = [
  {
    value: "dry_run",
    label: "Dry Run",
    description: "Discover candidates and draft messages only",
  },
  {
    value: "reviewed_outreach",
    label: "Reviewed Outreach",
    description: "Allow approval-gated sends with evidence",
  },
];

const messageToneOptions: Array<{
  value: MessageTonePreset;
  label: string;
  description: string;
}> = [
  {
    value: "careful",
    label: "Careful",
    description: "Respectful, low pressure",
  },
  {
    value: "warm",
    label: "Warm",
    description: "Personal, professional",
  },
  {
    value: "concise",
    label: "Concise",
    description: "Short and direct",
  },
];

export function CampaignWizard({ onComplete, onCancel }: CampaignWizardProps) {
  const [step, setStep] = useState(1);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<any>(null);
  const [snippetTitle, setSnippetTitle] = useState("");
  const [campaignData, setCampaignData] = useState<CampaignData>({
    title: "",
    description: "",
    selectedPlatforms: [],
    location: "",
    experience: "",
    services: "",
    minBudget: "",
    maxBudget: "",
    compatibilityThreshold: 70,
    maxCandidates: 50,
    autoSendMessages: false,
    isScheduled: false,
    scheduledFor: "",
    isRecurring: false,
    recurringPattern: "daily",
    dailySendLimit: 5,
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    operationMode: "dry_run",
    messageTonePreset: "careful",
    messageTemplateSnippet: "",
  });

  const { data: platforms } = trpc.platforms.list.useQuery();
  const { data: messageSnippets = [] } = trpc.messageSnippets.list.useQuery();
  const utils = trpc.useUtils();

  const createCampaign = trpc.campaigns.create.useMutation();
  const discoverCandidates = trpc.candidates.discover.useMutation();
  const bulkOutreach = trpc.messages.bulkOutreach.useMutation();
  const createMessageSnippet = trpc.messageSnippets.create.useMutation({
    onSuccess: async () => {
      await utils.messageSnippets.list.invalidate();
    },
  });

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleApplySnippet = (snippetId: string) => {
    const snippet = messageSnippets.find(
      entry => entry.id === Number(snippetId)
    );
    if (!snippet) return;

    setCampaignData({
      ...campaignData,
      messageTonePreset: snippet.tonePreset,
      messageTemplateSnippet: snippet.body.slice(0, 280),
    });
    toast.success("Snippet applied to the draft note");
  };

  const handleSaveSnippet = async () => {
    const body = campaignData.messageTemplateSnippet.trim();
    const title = snippetTitle.trim();
    if (!body) {
      toast.error("Add a draft note before saving a snippet");
      return;
    }
    if (!title) {
      toast.error("Add a snippet title");
      return;
    }

    try {
      await createMessageSnippet.mutateAsync({
        title,
        body,
        language: "nl",
        tonePreset: campaignData.messageTonePreset,
      });
      setSnippetTitle("");
      toast.success("Snippet saved");
    } catch (error: any) {
      toast.error(error?.message || "Snippet could not be saved");
    }
  };

  const handleSubmit = async () => {
    if (
      !campaignData.title ||
      !campaignData.description ||
      campaignData.selectedPlatforms.length === 0
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate scheduling fields if scheduled
    if (campaignData.isScheduled && !campaignData.scheduledFor) {
      toast.error("Please select a date and time for the scheduled campaign");
      return;
    }

    try {
      setIsDiscovering(true);
      const searchCriteria = {
        location: campaignData.location,
        experience: campaignData.experience,
        services: campaignData.services,
        minBudget: campaignData.minBudget,
        maxBudget: campaignData.maxBudget,
        compatibilityThreshold: campaignData.compatibilityThreshold,
        maxCandidates: campaignData.maxCandidates,
        safetyPolicy: {
          dailySendLimit: campaignData.dailySendLimit,
          quietHoursStart: campaignData.quietHoursStart,
          quietHoursEnd: campaignData.quietHoursEnd,
        },
        operationMode: campaignData.operationMode,
        messageDrafting: {
          tonePreset: campaignData.messageTonePreset,
          templateSnippet: campaignData.messageTemplateSnippet
            .trim()
            .slice(0, 280),
        },
      };

      // If scheduled, create the campaign and return (don't trigger discovery)
      if (campaignData.isScheduled) {
        toast.info("Creating scheduled campaign...");

        const scheduledFor = new Date(campaignData.scheduledFor);
        const campaign = await createCampaign.mutateAsync({
          title: campaignData.title,
          description: campaignData.description,
          targetPlatforms: JSON.stringify(campaignData.selectedPlatforms),
          searchCriteria: JSON.stringify(searchCriteria),
          status: "scheduled",
          isScheduled: 1,
          scheduledFor: scheduledFor.toISOString(),
          isRecurring: campaignData.isRecurring ? 1 : 0,
          recurringPattern: campaignData.isRecurring
            ? campaignData.recurringPattern
            : null,
          nextExecutionAt: scheduledFor.toISOString(),
        });

        toast.success(
          campaignData.isRecurring
            ? `Campaign scheduled! Will run ${campaignData.recurringPattern} starting ${scheduledFor.toLocaleString()}`
            : `Campaign scheduled for ${scheduledFor.toLocaleString()}`
        );
        setIsDiscovering(false);
        onComplete();
        return;
      }

      // Otherwise, create and launch immediately
      toast.info("Creating campaign...");

      // Step 1: Create the campaign
      const campaign = await createCampaign.mutateAsync({
        title: campaignData.title,
        description: campaignData.description,
        targetPlatforms: JSON.stringify(campaignData.selectedPlatforms),
        searchCriteria: JSON.stringify(searchCriteria),
      });

      toast.success("Campaign created! Discovering candidates...");

      // Step 2: Trigger candidate discovery
      const platformNames =
        platforms
          ?.filter(p => campaignData.selectedPlatforms.includes(p.id))
          .map(p => p.name) || [];

      const results = await discoverCandidates.mutateAsync({
        campaignId: campaign.id,
        platforms: platformNames,
        searchCriteria: {
          location: campaignData.location,
          experience: campaignData.experience,
          services: campaignData.services,
          minBudget: campaignData.minBudget,
          maxBudget: campaignData.maxBudget,
        },
      });

      setDiscoveryResults(results);
      toast.success(`Found ${results.candidatesFound} candidates!`);

      // Step 3: Optionally prepare draft messages for review
      if (campaignData.autoSendMessages && results.candidatesFound > 0) {
        toast.info("Generating personalized messages...");

        const messagingResults = await bulkOutreach.mutateAsync({
          campaignId: campaign.id,
          language: "nl",
        });

        const skippedMessages =
          (messagingResults.messagesSkippedExistingOutreach || 0) +
          (messagingResults.messagesSkippedStoppedOutreach || 0) +
          (messagingResults.messagesSkippedByLimit || 0);
        toast.success(
          `${messagingResults.messagesQueued} messages queued for review${
            skippedMessages > 0
              ? `, ${skippedMessages} skipped by safety rules`
              : ""
          }`
        );
      }

      // Complete the wizard
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (error: any) {
      toast.error(`Failed: ${error.message}`);
      setIsDiscovering(false);
    }
  };

  const togglePlatform = (platformId: number) => {
    setCampaignData(prev => ({
      ...prev,
      selectedPlatforms: prev.selectedPlatforms.includes(platformId)
        ? prev.selectedPlatforms.filter(id => id !== platformId)
        : [...prev.selectedPlatforms, platformId],
    }));
  };

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0">
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold sm:text-2xl">Create New Campaign</h2>
          <Badge variant="outline" className="text-sm">
            Step {step} of {totalSteps}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card className="min-w-0 border-2 shadow-xl">
        {/* Step 1: Campaign Details */}
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Campaign Details
              </CardTitle>
              <CardDescription>
                Give your campaign a name and description
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Campaign Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Find Care Workers in Arnhem"
                  value={campaignData.title}
                  onChange={e =>
                    setCampaignData({ ...campaignData, title: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what you're looking for..."
                  rows={4}
                  value={campaignData.description}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      description: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Select Platforms *</Label>
                <div className="grid grid-cols-1 gap-3">
                  {platforms?.map(platform => (
                    <div
                      key={platform.id}
                      className={`flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        campaignData.selectedPlatforms.includes(platform.id)
                          ? "border-purple-500 bg-purple-50"
                          : "border-gray-200 hover:border-purple-300"
                      }`}
                      onClick={() => togglePlatform(platform.id)}
                    >
                      <Checkbox
                        checked={campaignData.selectedPlatforms.includes(
                          platform.id
                        )}
                        onCheckedChange={() => togglePlatform(platform.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{platform.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {platform.baseUrl}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 2: Target Criteria */}
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Target Criteria</CardTitle>
              <CardDescription>Define who you're looking for</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Arnhem, Netherlands"
                  value={campaignData.location}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      location: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience">Required Experience</Label>
                <Input
                  id="experience"
                  placeholder="e.g., 2+ years in elderly care"
                  value={campaignData.experience}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      experience: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="services">Services Needed</Label>
                <Textarea
                  id="services"
                  placeholder="e.g., Personal care, medication management, companionship"
                  rows={3}
                  value={campaignData.services}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      services: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minBudget">Min Budget (€/hour)</Label>
                  <Input
                    id="minBudget"
                    type="number"
                    placeholder="15"
                    value={campaignData.minBudget}
                    onChange={e =>
                      setCampaignData({
                        ...campaignData,
                        minBudget: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBudget">Max Budget (€/hour)</Label>
                  <Input
                    id="maxBudget"
                    type="number"
                    placeholder="25"
                    value={campaignData.maxBudget}
                    onChange={e =>
                      setCampaignData({
                        ...campaignData,
                        maxBudget: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 3: AI Matching Configuration */}
        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                AI Matching Configuration
              </CardTitle>
              <CardDescription>
                Configure how AI will match candidates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="threshold">Compatibility Threshold</Label>
                  <span className="text-sm font-medium text-purple-600">
                    {campaignData.compatibilityThreshold}%
                  </span>
                </div>
                <input
                  id="threshold"
                  type="range"
                  min="50"
                  max="100"
                  value={campaignData.compatibilityThreshold}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      compatibilityThreshold: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <p className="text-sm text-muted-foreground">
                  Only candidates scoring above this threshold will be contacted
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="maxCandidates">Maximum Candidates</Label>
                  <span className="text-sm font-medium text-purple-600">
                    {campaignData.maxCandidates}
                  </span>
                </div>
                <input
                  id="maxCandidates"
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={campaignData.maxCandidates}
                  onChange={e =>
                    setCampaignData({
                      ...campaignData,
                      maxCandidates: parseInt(e.target.value),
                    })
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <p className="text-sm text-muted-foreground">
                  AI will prepare reviewable drafts for the top{" "}
                  {campaignData.maxCandidates} matches
                </p>
              </div>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <h4 className="font-medium text-purple-900 mb-2">
                  AI Matching Factors
                </h4>
                <ul className="text-sm text-purple-700 space-y-1">
                  <li>✓ Location proximity and distance</li>
                  <li>✓ Experience and qualifications</li>
                  <li>✓ Service specialization match</li>
                  <li>✓ Availability and schedule fit</li>
                  <li>✓ Budget compatibility</li>
                  <li>✓ Language and communication skills</li>
                  <li>✓ Reviews and ratings</li>
                  <li>✓ 18+ additional intelligent factors</li>
                </ul>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 4: Review and Launch */}
        {step === 4 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                Review & Launch
              </CardTitle>
              <CardDescription>
                Review your campaign before launching
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 rounded-lg border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 p-4 sm:p-6">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Campaign Title
                  </h4>
                  <p className="text-lg">{campaignData.title}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Description
                  </h4>
                  <p className="text-gray-600">{campaignData.description}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Target Platforms
                  </h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {platforms
                      ?.filter(p =>
                        campaignData.selectedPlatforms.includes(p.id)
                      )
                      .map(p => (
                        <Badge
                          key={p.id}
                          variant="secondary"
                          className="bg-purple-100 text-purple-700"
                        >
                          {p.name}
                        </Badge>
                      ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-1">
                      Compatibility Threshold
                    </h4>
                    <p className="text-purple-600 font-medium">
                      {campaignData.compatibilityThreshold}%
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-1">
                      Max Candidates
                    </h4>
                    <p className="text-purple-600 font-medium">
                      {campaignData.maxCandidates}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Operation Mode
                  </h4>
                  <p className="text-purple-600 font-medium">
                    {campaignData.operationMode === "dry_run"
                      ? "Dry Run"
                      : "Reviewed Outreach"}
                  </p>
                </div>
              </div>

              {/* Operation Mode */}
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                <div>
                  <h4 className="font-semibold text-blue-950">Campaign Mode</h4>
                  <p className="mt-1 text-sm text-blue-800">
                    Dry run keeps the campaign in discovery and drafting mode.
                    Reviewed outreach allows approval-gated sends with delivery
                    evidence.
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {operationModeOptions.map(option => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        campaignData.operationMode === option.value
                          ? "default"
                          : "outline"
                      }
                      className={
                        campaignData.operationMode === option.value
                          ? "h-auto justify-start whitespace-normal bg-blue-700 text-white hover:bg-blue-700"
                          : "h-auto justify-start whitespace-normal border-blue-200 bg-white text-blue-950 hover:bg-blue-100"
                      }
                      onClick={() =>
                        setCampaignData({
                          ...campaignData,
                          operationMode: option.value,
                        })
                      }
                    >
                      <span className="text-left">
                        <span className="block font-medium">
                          {option.label}
                        </span>
                        <span className="block text-xs opacity-80">
                          {option.description}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Message Drafting Option */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="autoSendMessages"
                    checked={campaignData.autoSendMessages}
                    onCheckedChange={checked =>
                      setCampaignData({
                        ...campaignData,
                        autoSendMessages: checked as boolean,
                      })
                    }
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="autoSendMessages"
                      className="font-semibold text-green-900 cursor-pointer"
                    >
                      Prepare Draft Messages for Review
                    </Label>
                    <p className="text-sm text-green-700 mt-1">
                      AI will generate personalized Dutch drafts for qualified
                      candidates and queue them for review. In dry-run mode,
                      these drafts cannot be approved or marked sent.
                    </p>
                  </div>
                </div>

                {campaignData.autoSendMessages && (
                  <div className="mt-4 space-y-4 border-t border-green-200 pt-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-green-950">
                        Draft Tone
                      </Label>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {messageToneOptions.map(option => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={
                              campaignData.messageTonePreset === option.value
                                ? "default"
                                : "outline"
                            }
                            className={
                              campaignData.messageTonePreset === option.value
                                ? "h-auto justify-start whitespace-normal bg-green-700 text-white hover:bg-green-700"
                                : "h-auto justify-start whitespace-normal border-green-200 bg-white text-green-950 hover:bg-green-50"
                            }
                            onClick={() =>
                              setCampaignData({
                                ...campaignData,
                                messageTonePreset: option.value,
                              })
                            }
                          >
                            <span className="text-left">
                              <span className="block font-medium">
                                {option.label}
                              </span>
                              <span className="block text-xs opacity-80">
                                {option.description}
                              </span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="messageTemplateSnippet"
                        className="text-sm font-medium text-green-950"
                      >
                        Optional Draft Note
                      </Label>
                      <Textarea
                        id="messageTemplateSnippet"
                        rows={3}
                        maxLength={280}
                        placeholder="Example: Mention that evening availability is helpful."
                        value={campaignData.messageTemplateSnippet}
                        onChange={e =>
                          setCampaignData({
                            ...campaignData,
                            messageTemplateSnippet: e.target.value.slice(
                              0,
                              280
                            ),
                          })
                        }
                        className="bg-white"
                      />
                      <p className="text-xs text-green-700">
                        {campaignData.messageTemplateSnippet.length}/280
                        characters. This note guides drafts but is not written
                        to audit logs.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label
                          htmlFor="savedSnippet"
                          className="text-sm font-medium text-green-950"
                        >
                          Saved Snippet
                        </Label>
                        <Select
                          disabled={messageSnippets.length === 0}
                          onValueChange={handleApplySnippet}
                        >
                          <SelectTrigger
                            id="savedSnippet"
                            className="w-full bg-white"
                          >
                            <SelectValue
                              placeholder={
                                messageSnippets.length === 0
                                  ? "No saved snippets"
                                  : "Apply saved snippet"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {messageSnippets.map(snippet => (
                              <SelectItem
                                key={snippet.id}
                                value={String(snippet.id)}
                              >
                                {snippet.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="snippetTitle"
                          className="text-sm font-medium text-green-950"
                        >
                          Save Current Note
                        </Label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            id="snippetTitle"
                            maxLength={120}
                            placeholder="Snippet title"
                            value={snippetTitle}
                            onChange={e =>
                              setSnippetTitle(e.target.value.slice(0, 120))
                            }
                            className="bg-white"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSaveSnippet}
                            disabled={createMessageSnippet.isPending}
                            className="border-green-200 bg-white text-green-950 hover:bg-green-50"
                          >
                            {createMessageSnippet.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 h-4 w-4" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Outreach Safety Policy */}
              <div className="bg-gradient-to-br from-slate-50 to-gray-50 border-2 border-slate-200 rounded-lg p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-900">
                    Outreach Safety Policy
                  </h4>
                  <p className="text-sm text-slate-700 mt-1">
                    Limits confirmed external sends and pauses scheduled
                    discovery during quiet hours.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label
                      htmlFor="dailySendLimit"
                      className="text-sm font-medium text-slate-900"
                    >
                      Daily Send Cap
                    </Label>
                    <Input
                      id="dailySendLimit"
                      type="number"
                      min={1}
                      max={20}
                      value={campaignData.dailySendLimit}
                      onChange={e =>
                        setCampaignData({
                          ...campaignData,
                          dailySendLimit: Number(e.target.value),
                        })
                      }
                      className="bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="quietHoursStart"
                      className="text-sm font-medium text-slate-900"
                    >
                      Quiet From
                    </Label>
                    <Input
                      id="quietHoursStart"
                      type="time"
                      value={campaignData.quietHoursStart}
                      onChange={e =>
                        setCampaignData({
                          ...campaignData,
                          quietHoursStart: e.target.value,
                        })
                      }
                      className="bg-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="quietHoursEnd"
                      className="text-sm font-medium text-slate-900"
                    >
                      Quiet Until
                    </Label>
                    <Input
                      id="quietHoursEnd"
                      type="time"
                      value={campaignData.quietHoursEnd}
                      onChange={e =>
                        setCampaignData({
                          ...campaignData,
                          quietHoursEnd: e.target.value,
                        })
                      }
                      className="bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Campaign Scheduling Option */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 space-y-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="isScheduled"
                    checked={campaignData.isScheduled}
                    onCheckedChange={checked =>
                      setCampaignData({
                        ...campaignData,
                        isScheduled: checked as boolean,
                      })
                    }
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="isScheduled"
                      className="font-semibold text-blue-900 cursor-pointer"
                    >
                      Schedule Campaign Execution
                    </Label>
                    <p className="text-sm text-blue-700 mt-1">
                      Schedule this campaign to run automatically at a specific
                      time instead of launching immediately.
                    </p>
                  </div>
                </div>

                {campaignData.isScheduled && (
                  <div className="space-y-4 pl-8">
                    <div className="space-y-2">
                      <Label
                        htmlFor="scheduledFor"
                        className="text-sm font-medium text-blue-900"
                      >
                        Execution Date & Time
                      </Label>
                      <Input
                        id="scheduledFor"
                        type="datetime-local"
                        value={campaignData.scheduledFor}
                        onChange={e =>
                          setCampaignData({
                            ...campaignData,
                            scheduledFor: e.target.value,
                          })
                        }
                        className="bg-white"
                      />
                      <p className="text-xs text-blue-600">
                        Best time: Weekday mornings 9-11 AM for highest response
                        rates
                      </p>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="isRecurring"
                        checked={campaignData.isRecurring}
                        onCheckedChange={checked =>
                          setCampaignData({
                            ...campaignData,
                            isRecurring: checked as boolean,
                          })
                        }
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="isRecurring"
                          className="text-sm font-medium text-blue-900 cursor-pointer"
                        >
                          Make this a recurring campaign
                        </Label>
                      </div>
                    </div>

                    {campaignData.isRecurring && (
                      <div className="space-y-2 pl-8">
                        <Label className="text-sm font-medium text-blue-900">
                          Recurrence Pattern
                        </Label>
                        <div className="flex gap-2">
                          {["daily", "weekly", "monthly"].map(pattern => (
                            <Button
                              key={pattern}
                              type="button"
                              variant={
                                campaignData.recurringPattern === pattern
                                  ? "default"
                                  : "outline"
                              }
                              size="sm"
                              onClick={() =>
                                setCampaignData({
                                  ...campaignData,
                                  recurringPattern: pattern,
                                })
                              }
                              className={
                                campaignData.recurringPattern === pattern
                                  ? "bg-blue-600"
                                  : ""
                              }
                            >
                              {pattern.charAt(0).toUpperCase() +
                                pattern.slice(1)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Once launched, AI will discover
                  candidates and score compatibility.
                  {campaignData.autoSendMessages &&
                    " Personalized draft messages will be prepared for review."}
                  {!campaignData.autoSendMessages &&
                    " You can manually review candidates and send messages later."}
                </p>
              </div>
            </CardContent>
          </>
        )}

        <CardFooter className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={step === 1 ? onCancel : handleBack}
            disabled={createCampaign.isPending}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < totalSteps ? (
            <Button
              onClick={handleNext}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 sm:w-auto"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isDiscovering}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 sm:w-auto"
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {discoveryResults
                    ? "Completing..."
                    : "Discovering Candidates..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Launch Campaign
                </>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
