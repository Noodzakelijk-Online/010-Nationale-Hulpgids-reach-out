import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
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
}

export function CampaignWizard({ onComplete, onCancel }: CampaignWizardProps) {
  const [step, setStep] = useState(1);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<any>(null);
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
  });

  const { data: platforms } = trpc.platforms.list.useQuery();
  
  const createCampaign = trpc.campaigns.create.useMutation();
  const discoverCandidates = trpc.candidates.discover.useMutation();
  const bulkOutreach = trpc.messages.bulkOutreach.useMutation();

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

  const handleSubmit = async () => {
    if (!campaignData.title || !campaignData.description || campaignData.selectedPlatforms.length === 0) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsDiscovering(true);
      toast.info("Creating campaign...");

      // Step 1: Create the campaign
      const campaign = await createCampaign.mutateAsync({
        title: campaignData.title,
        description: campaignData.description,
        targetPlatforms: JSON.stringify(campaignData.selectedPlatforms),
        searchCriteria: JSON.stringify({
          location: campaignData.location,
          experience: campaignData.experience,
          services: campaignData.services,
          minBudget: campaignData.minBudget,
          maxBudget: campaignData.maxBudget,
          compatibilityThreshold: campaignData.compatibilityThreshold,
          maxCandidates: campaignData.maxCandidates,
        }),
      });

      toast.success("Campaign created! Discovering candidates...");

      // Step 2: Trigger candidate discovery
      const platformNames = platforms
        ?.filter((p) => campaignData.selectedPlatforms.includes(p.id))
        .map((p) => p.name) || [];

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
      
      // Step 3: Optionally trigger automated messaging
      if (campaignData.autoSendMessages && results.candidatesFound > 0) {
        toast.info("Generating personalized messages...");
        
        const messagingResults = await bulkOutreach.mutateAsync({
          campaignId: campaign.id,
          language: "nl",
        });
        
        toast.success(`${messagingResults.messagesQueued} messages queued for sending!`);
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
    setCampaignData((prev) => ({
      ...prev,
      selectedPlatforms: prev.selectedPlatforms.includes(platformId)
        ? prev.selectedPlatforms.filter((id) => id !== platformId)
        : [...prev.selectedPlatforms, platformId],
    }));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Create New Campaign</h2>
          <Badge variant="outline" className="text-sm">
            Step {step} of {totalSteps}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Card className="shadow-xl border-2">
        {/* Step 1: Campaign Details */}
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Campaign Details
              </CardTitle>
              <CardDescription>Give your campaign a name and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Campaign Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Find Care Workers in Arnhem"
                  value={campaignData.title}
                  onChange={(e) => setCampaignData({ ...campaignData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what you're looking for..."
                  rows={4}
                  value={campaignData.description}
                  onChange={(e) => setCampaignData({ ...campaignData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Select Platforms *</Label>
                <div className="grid grid-cols-1 gap-3">
                  {platforms?.map((platform) => (
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
                        checked={campaignData.selectedPlatforms.includes(platform.id)}
                        onCheckedChange={() => togglePlatform(platform.id)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{platform.name}</p>
                        <p className="text-sm text-muted-foreground">{platform.baseUrl}</p>
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
                  onChange={(e) => setCampaignData({ ...campaignData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience">Required Experience</Label>
                <Input
                  id="experience"
                  placeholder="e.g., 2+ years in elderly care"
                  value={campaignData.experience}
                  onChange={(e) => setCampaignData({ ...campaignData, experience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="services">Services Needed</Label>
                <Textarea
                  id="services"
                  placeholder="e.g., Personal care, medication management, companionship"
                  rows={3}
                  value={campaignData.services}
                  onChange={(e) => setCampaignData({ ...campaignData, services: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minBudget">Min Budget (€/hour)</Label>
                  <Input
                    id="minBudget"
                    type="number"
                    placeholder="15"
                    value={campaignData.minBudget}
                    onChange={(e) => setCampaignData({ ...campaignData, minBudget: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxBudget">Max Budget (€/hour)</Label>
                  <Input
                    id="maxBudget"
                    type="number"
                    placeholder="25"
                    value={campaignData.maxBudget}
                    onChange={(e) => setCampaignData({ ...campaignData, maxBudget: e.target.value })}
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
              <CardDescription>Configure how AI will match candidates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="threshold">Compatibility Threshold</Label>
                  <span className="text-sm font-medium text-purple-600">{campaignData.compatibilityThreshold}%</span>
                </div>
                <input
                  id="threshold"
                  type="range"
                  min="50"
                  max="100"
                  value={campaignData.compatibilityThreshold}
                  onChange={(e) =>
                    setCampaignData({ ...campaignData, compatibilityThreshold: parseInt(e.target.value) })
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
                  <span className="text-sm font-medium text-purple-600">{campaignData.maxCandidates}</span>
                </div>
                <input
                  id="maxCandidates"
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={campaignData.maxCandidates}
                  onChange={(e) => setCampaignData({ ...campaignData, maxCandidates: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <p className="text-sm text-muted-foreground">
                  AI will reach out to the top {campaignData.maxCandidates} matches
                </p>
              </div>
              <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                <h4 className="font-medium text-purple-900 mb-2">AI Matching Factors</h4>
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
              <CardDescription>Review your campaign before launching</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-6 space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">Campaign Title</h4>
                  <p className="text-lg">{campaignData.title}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
                  <p className="text-gray-600">{campaignData.description}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">Target Platforms</h4>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {platforms
                      ?.filter((p) => campaignData.selectedPlatforms.includes(p.id))
                      .map((p) => (
                        <Badge key={p.id} variant="secondary" className="bg-purple-100 text-purple-700">
                          {p.name}
                        </Badge>
                      ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-1">Compatibility Threshold</h4>
                    <p className="text-purple-600 font-medium">{campaignData.compatibilityThreshold}%</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-700 mb-1">Max Candidates</h4>
                    <p className="text-purple-600 font-medium">{campaignData.maxCandidates}</p>
                  </div>
                </div>
              </div>
              
              {/* Automated Messaging Option */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="autoSendMessages"
                    checked={campaignData.autoSendMessages}
                    onCheckedChange={(checked) =>
                      setCampaignData({ ...campaignData, autoSendMessages: checked as boolean })
                    }
                  />
                  <div className="flex-1">
                    <Label htmlFor="autoSendMessages" className="font-semibold text-green-900 cursor-pointer">
                      Enable Automated Messaging
                    </Label>
                    <p className="text-sm text-green-700 mt-1">
                      AI will automatically generate personalized messages in Dutch for all qualified candidates and queue them for sending.
                      You can review messages before they are sent from the Messages page.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Once launched, AI will discover candidates and score compatibility.
                  {campaignData.autoSendMessages && " Personalized messages will be generated automatically."}
                  {!campaignData.autoSendMessages && " You can manually review candidates and send messages later."}
                </p>
              </div>
            </CardContent>
          </>
        )}

        <CardFooter className="flex justify-between border-t pt-6">
          <Button variant="outline" onClick={step === 1 ? onCancel : handleBack} disabled={createCampaign.isPending}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < totalSteps ? (
            <Button onClick={handleNext} className="bg-gradient-to-r from-purple-600 to-blue-600">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isDiscovering}
              className="bg-gradient-to-r from-green-600 to-emerald-600"
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {discoveryResults ? "Completing..." : "Discovering Candidates..."}
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
