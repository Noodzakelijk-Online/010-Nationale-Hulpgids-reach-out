import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  ClipboardCheck,
  KeyRound,
  MessageSquareWarning,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "reachout.safe-use-onboarding:v1";

const steps = [
  {
    id: "credentials",
    title: "Platform access",
    body: "Use credentials only for accounts Robert controls. Public-only platforms can discover listings without saved credentials.",
    icon: KeyRound,
    href: "/platforms",
    action: "Open platforms",
  },
  {
    id: "campaign",
    title: "Campaign criteria",
    body: "Set location, services, availability, and budget before discovery so candidates can be scored and explained.",
    icon: Target,
    href: "/campaigns",
    action: "Open campaigns",
  },
  {
    id: "approval",
    title: "Review gate",
    body: "Every outbound or follow-up message needs explicit approval before it can be marked as sent.",
    icon: MessageSquareWarning,
    href: "/messages",
    action: "Review messages",
  },
  {
    id: "ledger",
    title: "Operating ledger",
    body: "Use responses, follow-ups, and audit events to avoid duplicate outreach and keep decisions traceable.",
    icon: ClipboardCheck,
    href: "/audit",
    action: "Open audit",
  },
] as const;

type StepId = (typeof steps)[number]["id"];

function loadAcknowledged() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return false;
    const parsed = JSON.parse(value) as { acknowledgedAt?: string };
    return typeof parsed.acknowledgedAt === "string";
  } catch {
    return false;
  }
}

function saveAcknowledged() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ acknowledgedAt: new Date().toISOString() })
    );
  } catch {
    // Private browsing or storage limits should not block app use.
  }
}

export default function SafeUseOnboarding({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [checked, setChecked] = useState<Record<StepId, boolean>>({
    credentials: false,
    campaign: false,
    approval: false,
    ledger: false,
  });

  const isControlled = open !== undefined;
  const currentOpen = isControlled ? open : internalOpen;

  useEffect(() => {
    if (!isControlled && !loadAcknowledged()) {
      setInternalOpen(true);
    }
  }, [isControlled]);

  const completedCount = useMemo(
    () => steps.filter(step => checked[step.id]).length,
    [checked]
  );
  const allChecked = completedCount === steps.length;
  const progress = Math.round((completedCount / steps.length) * 100);

  const setOpen = (nextOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(nextOpen);
    } else {
      setInternalOpen(nextOpen);
    }
  };

  const complete = () => {
    saveAcknowledged();
    setOpen(false);
  };

  return (
    <Dialog open={currentOpen} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Safe outreach setup</DialogTitle>
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Approval-gated
            </Badge>
          </div>
          <DialogDescription>
            Complete this checklist before running discovery or approving
            messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Readiness</span>
              <span className="text-muted-foreground">
                {completedCount}/{steps.length}
              </span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="grid gap-3">
            {steps.map(step => {
              const Icon = step.icon;
              const isChecked = checked[step.id];

              return (
                <div
                  key={step.id}
                  className="flex gap-3 rounded-lg border bg-background p-3"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={value =>
                      setChecked(current => ({
                        ...current,
                        [step.id]: value === true,
                      }))
                    }
                    aria-label={`Mark ${step.title} complete`}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      {isChecked ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : null}
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {step.body}
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link href={step.href} onClick={() => setOpen(false)}>
                        {step.action}
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Later
          </Button>
          <Button onClick={complete} disabled={!allChecked}>
            Mark ready
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
