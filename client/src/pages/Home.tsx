import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Users, MessageSquare, Link as LinkIcon, Zap, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Home() {
  const { user } = useAuth();
  const { data: campaigns } = trpc.campaigns.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: platforms } = trpc.platforms.list.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-500 to-blue-600 text-white p-12">
          <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]" />
          <div className="relative text-center space-y-6">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
              <Zap className="h-4 w-4" />
              AI-Powered Automation Platform
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              Multi-Platform Reach-Out Tool
            </h1>
            <p className="text-xl md:text-2xl text-purple-100 max-w-3xl mx-auto">
              Automate your outreach across 5 major platforms with intelligent matching and personalized messaging
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Button size="lg" variant="secondary" asChild className="bg-white text-purple-600 hover:bg-purple-50">
                <Link href="/platforms">Connect Platforms</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="border-white text-white hover:bg-white/10">
                <Link href="/campaigns">Create Campaign</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Stats with Enhanced Design */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-white hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-900">Active Campaigns</CardTitle>
              <div className="p-2 bg-purple-100 rounded-lg">
                <Target className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900">{campaigns?.length || 0}</div>
              <p className="text-xs text-purple-600 mt-1">Running outreach efforts</p>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-900">Connected Platforms</CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg">
                <LinkIcon className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900">{platforms?.length || 0}</div>
              <p className="text-xs text-blue-600 mt-1">Available platforms</p>
            </CardContent>
          </Card>
          
          <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-white hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-cyan-900">Total Candidates</CardTitle>
              <div className="p-2 bg-cyan-100 rounded-lg">
                <Users className="h-4 w-4 text-cyan-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cyan-900">0</div>
              <p className="text-xs text-cyan-600 mt-1">Across all campaigns</p>
            </CardContent>
          </Card>
          
          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white hover:shadow-lg transition-all">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-indigo-900">Messages Sent</CardTitle>
              <div className="p-2 bg-indigo-100 rounded-lg">
                <MessageSquare className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-indigo-900">0</div>
              <p className="text-xs text-indigo-600 mt-1">Automated outreach</p>
            </CardContent>
          </Card>
        </div>

        {/* Features Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>AI-Powered Matching</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Intelligent compatibility scoring with 25+ factors including location, experience, services, and special needs expertise.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Automated Outreach</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Generate personalized messages in Dutch and English, send bulk outreach, and track responses automatically.
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Multi-Platform</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Connect to Indeed, Nationale Hulpgids, PGBvacatures, Zorgbanen, and Jobbird all in one place.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Get Started CTA */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Ready to get started?</h3>
                <p className="text-muted-foreground">
                  Connect your platform accounts and create your first campaign to start automated outreach.
                </p>
              </div>
              <div className="flex gap-3">
                <Button size="lg" asChild>
                  <Link href="/platforms">Connect Platforms</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/campaigns">Create Campaign</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
