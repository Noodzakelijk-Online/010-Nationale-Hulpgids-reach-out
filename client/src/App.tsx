import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/Home"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const Candidates = lazy(() => import("./pages/Candidates"));
const CandidateDetail = lazy(() => import("./pages/CandidateDetail"));
const Messages = lazy(() => import("./pages/Messages"));
const PlatformConnections = lazy(() => import("./pages/PlatformConnections"));
const QueueMonitor = lazy(() => import("./pages/QueueMonitor"));
const ScheduledCampaigns = lazy(() => import("./pages/ScheduledCampaigns"));
const ResponseInbox = lazy(() => import("./pages/ResponseInbox"));
const FollowUpQueue = lazy(() => import("./pages/FollowUpQueue"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function Router() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-muted-foreground">Loading...</div>
      }
    >
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/campaigns/:id" component={CampaignDetail} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/candidates/:id" component={CandidateDetail} />
        <Route path="/candidates" component={Candidates} />
        <Route path="/messages" component={Messages} />
        <Route path="/responses" component={ResponseInbox} />
        <Route path="/follow-ups" component={FollowUpQueue} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/platforms" component={PlatformConnections} />
        <Route path="/queue" component={QueueMonitor} />
        <Route path="/scheduled" component={ScheduledCampaigns} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
