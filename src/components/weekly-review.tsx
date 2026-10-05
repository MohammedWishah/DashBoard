import { useState } from "react";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/segmented";
import { useSaveReview, type ReviewAnswer } from "@/hooks/queries";
import { cn } from "@/lib/utils";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; active: Project[] };

export function WeeklyReview({ open, onOpenChange, active }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {open && <ReviewFlow active={active} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReviewFlow({ active, onDone }: { active: Project[]; onDone: () => void }) {
  // Snapshot the active set when the review starts so optimistic updates don't reshuffle the steps.
  const [projects] = useState(active);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ReviewAnswer[]>(() =>
    projects.map((p) => ({ id: p.id, status: "active", nextAction: p.nextAction, shipped: false, note: "" })),
  );
  const save = useSaveReview();

  if (projects.length === 0) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Weekly review</DialogTitle>
          <DialogDescription>No active projects to review. Activate one first.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onDone}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  const project = projects[step];
  const answer = answers[step];
  const isLast = step === projects.length - 1;
  const set = (patch: Partial<ReviewAnswer>) =>
    setAnswers((all) => all.map((a, i) => (i === step ? { ...a, ...patch } : a)));
  const canContinue = answer.nextAction.trim().length > 0;

  function finish() {
    save.mutate(
      answers.map((a) => ({ ...a, nextAction: a.nextAction.trim(), note: a.note.trim() })),
      { onSuccess: () => toast.success("Review saved") },
    );
    onDone();
  }

  return (
    <div className="grid gap-6">
      <DialogHeader>
        <p className="font-mono text-xs text-muted-foreground">
          Project {step + 1} of {projects.length}
        </p>
        <DialogTitle className="text-xl">{project.name}</DialogTitle>
        <DialogDescription className="sr-only">Review this project, then continue.</DialogDescription>
      </DialogHeader>

      <div className="flex gap-1" aria-hidden>
        {projects.map((p, i) => (
          <div key={p.id} className={cn("h-0.5 flex-1 rounded-full", i <= step ? "bg-ship" : "bg-border")} />
        ))}
      </div>

      <fieldset className="grid gap-2.5">
        <legend className="mb-2.5 text-[13px] font-medium">Still active?</legend>
        <Segmented<ProjectStatus>
          name={`status-${project.id}`}
          value={answer.status}
          onChange={(status) => set({ status })}
          options={[
            { value: "active", label: "Keep active" },
            { value: "parked", label: "Park" },
            { value: "archived", label: "Archive" },
          ]}
        />
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="review-next">Next action</Label>
        <Textarea
          id="review-next"
          value={answer.nextAction}
          onChange={(e) => set({ nextAction: e.target.value })}
          rows={2}
          maxLength={500}
          className="text-base"
          aria-invalid={!canContinue}
        />
        {!canContinue && <p className="text-xs text-destructive">A next action is required.</p>}
      </div>

      <fieldset className="grid gap-2.5">
        <legend className="mb-2.5 text-[13px] font-medium">Shipped anything this week?</legend>
        <Segmented<"no" | "yes">
          name={`shipped-${project.id}`}
          value={answer.shipped ? "yes" : "no"}
          onChange={(v) => set({ shipped: v === "yes" })}
          options={[
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ]}
        />
        {answer.shipped && (
          <div className="mt-1 grid gap-2">
            <Label htmlFor="review-note">What shipped?</Label>
            <Input id="review-note" value={answer.note} onChange={(e) => set({ note: e.target.value })} maxLength={1000} />
            <p className="text-xs text-muted-foreground">Optional.</p>
          </div>
        )}
      </fieldset>

      <DialogFooter className="sm:justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          Back
        </Button>
        {isLast ? (
          <Button variant="ship" onClick={finish} disabled={!canContinue}>
            Save review
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
            Next project
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}
