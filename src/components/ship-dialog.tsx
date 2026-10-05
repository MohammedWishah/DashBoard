import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Project } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useShipProject } from "@/hooks/queries";

type Props = { project: Project | null; onOpenChange: (open: boolean) => void };

export function ShipDialog({ project, onOpenChange }: Props) {
  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">{project && <ShipForm key={project.id} project={project} onOpenChange={onOpenChange} />}</DialogContent>
    </Dialog>
  );
}

function ShipForm({ project, onOpenChange }: { project: Project; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState("");
  const ship = useShipProject();

  function submit(e: FormEvent) {
    e.preventDefault();
    // Optimistic: close right away, the count updates immediately and rolls back on error.
    ship.mutate({ id: project.id, note }, { onSuccess: () => toast.success(`Shipped ${project.name}`) });
    onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Ship {project.name}</DialogTitle>
        <DialogDescription>Log something you finished. It counts toward this week.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="ship-note">What did you ship?</Label>
        <Textarea id="ship-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} autoFocus />
        <p className="text-xs text-muted-foreground">Optional.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" variant="ship">
          Log ship
        </Button>
      </DialogFooter>
    </form>
  );
}
