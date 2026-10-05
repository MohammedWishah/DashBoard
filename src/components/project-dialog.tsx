import { useState, type FormEvent } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { MAX_ACTIVE_PROJECTS } from "@shared/rules";
import type { Project, ProjectStatus } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { activeSlotsLeft, useCreateProject, useUpdateProject } from "@/hooks/queries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this project, or create a new one when omitted. */
  project?: Project;
  projects: Project[] | undefined;
};

export function ProjectDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        {/* Remount per open so the form always starts from the current project */}
        {props.open && <ProjectForm key={props.project?.id ?? "new"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ onOpenChange, project, projects }: Props) {
  const slotsLeft = activeSlotsLeft(projects, project?.id);
  const [name, setName] = useState(project?.name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? (slotsLeft > 0 ? "active" : "parked"));
  const [nextAction, setNextAction] = useState(project?.nextAction ?? "");
  const [doneDefinition, setDoneDefinition] = useState(project?.doneDefinition ?? "");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateProject();
  const update = useUpdateProject();
  const pending = create.isPending || update.isPending;
  const activeBlocked = slotsLeft <= 0 && project?.status !== "active";
  const activeNames = (projects ?? [])
    .filter((p) => p.status === "active" && p.id !== project?.id)
    .map((p) => p.name);

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (status === "active" && activeBlocked) {
      setError(`Only ${MAX_ACTIVE_PROJECTS} projects can be active.`);
      return;
    }
    const values = { name, status, nextAction, doneDefinition };
    const onSuccess = () => onOpenChange(false);
    const onError = (err: Error) => setError(err.message);
    if (project) update.mutate({ id: project.id, patch: values }, { onSuccess, onError });
    else create.mutate(values, { onSuccess, onError });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>Every project needs one concrete next action.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="pd-name">Name</Label>
        <Input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus={!project} />
        <p className="text-xs text-muted-foreground">Keep it easy to say out loud. The voice assistant finds projects by name.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pd-next">Next action</Label>
        <Textarea
          id="pd-next"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          required
          maxLength={500}
          rows={2}
          className="text-base"
        />
        <p className="text-xs text-muted-foreground">Small enough to start in one sitting.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pd-done">Done when</Label>
        <Textarea
          id="pd-done"
          value={doneDefinition}
          onChange={(e) => setDoneDefinition(e.target.value)}
          maxLength={1000}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">Optional. What finished looks like.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pd-status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
          <SelectTrigger id="pd-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active" disabled={activeBlocked}>
              Active{activeBlocked ? " (both slots taken)" : ""}
            </SelectItem>
            <SelectItem value="parked">Parked</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        {activeBlocked && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <WarningCircle className="mt-px size-4 shrink-0 text-ship" weight="fill" />
            <span>
              {activeNames.join(" and ")} {activeNames.length === 1 ? "is" : "are"} active. Park one to free a slot.
            </span>
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {project ? "Save" : "Add project"}
        </Button>
      </DialogFooter>
    </form>
  );
}
