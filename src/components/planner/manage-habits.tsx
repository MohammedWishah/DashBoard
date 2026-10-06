import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { FREQUENCIES, type Frequency } from "@shared/planner";
import type { HabitRow } from "@shared/planner-schemas";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useHabits, usePlannerAction } from "@/hooks/planner";
import { plannerApi } from "@/lib/planner-api";

const LABEL: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

export function ManageHabits({ open, onClose }: { open: boolean; onClose: () => void }) {
  const habits = useHabits();
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [name, setName] = useState("");
  const create = usePlannerAction((v: { name: string; frequency: Frequency }) => plannerApi.createHabit(v), "Habit added");
  const rows = (habits.data ?? []).filter((h) => h.frequency === frequency);
  const active = rows.filter((h) => !h.archived);
  const archived = rows.filter((h) => h.archived);

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), frequency }, { onSuccess: () => setName("") });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage habits</DialogTitle>
          <DialogDescription>Daily habits get a box every day, weekly ones every week, monthly ones every month.</DialogDescription>
        </DialogHeader>
        <Segmented name="frequency" value={frequency} onChange={setFrequency} options={FREQUENCIES.map((f) => ({ value: f, label: LABEL[f] }))} />
        <ul className="grid gap-2">
          {active.map((h, i) => (
            <HabitEditor key={h.id} habit={h} above={active[i - 1]} below={active[i + 1]} />
          ))}
          {active.length === 0 && <li className="text-sm text-muted-foreground">No {frequency} habits yet.</li>}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${frequency} habit`} maxLength={80} aria-label="New habit name" />
          <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
            Add
          </Button>
        </form>
        {archived.length > 0 && (
          <div className="grid gap-2 border-t border-border/70 pt-4">
            <p className="text-xs text-muted-foreground">Archived (history kept)</p>
            {archived.map((h) => (
              <ArchivedHabit key={h.id} habit={h} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HabitEditor({ habit, above, below }: { habit: HabitRow; above?: HabitRow; below?: HabitRow }) {
  const [name, setName] = useState(habit.name);
  const rename = usePlannerAction((n: string) => plannerApi.updateHabit(habit.id, { name: n }));
  const archive = usePlannerAction(() => plannerApi.updateHabit(habit.id, { archived: true }), `${habit.name} archived`);
  const swap = usePlannerAction(async (other: HabitRow) => {
    await plannerApi.updateHabit(habit.id, { sortOrder: other.sortOrder });
    await plannerApi.updateHabit(other.id, { sortOrder: habit.sortOrder });
  });

  function saveName() {
    const n = name.trim();
    if (!n) return setName(habit.name);
    if (n !== habit.name) rename.mutate(n, { onError: () => setName(habit.name) });
  }

  return (
    <li className="flex items-center gap-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        maxLength={80}
        className="h-8"
        aria-label={`Rename ${habit.name}`}
      />
      <Button variant="ghost" size="icon-sm" disabled={!above} onClick={() => above && swap.mutate(above)} aria-label={`Move ${habit.name} up`}>
        <ArrowUp />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={!below} onClick={() => below && swap.mutate(below)} aria-label={`Move ${habit.name} down`}>
        <ArrowDown />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => archive.mutate(undefined)} className="text-muted-foreground">
        Archive
      </Button>
    </li>
  );
}

function ArchivedHabit({ habit }: { habit: HabitRow }) {
  const [confirming, setConfirming] = useState(false);
  const restore = usePlannerAction(() => plannerApi.updateHabit(habit.id, { archived: false }), `${habit.name} restored`);
  const remove = usePlannerAction(() => plannerApi.deleteHabit(habit.id), `${habit.name} deleted`);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate text-muted-foreground">{habit.name}</span>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => restore.mutate(undefined)}>
          Restore
        </Button>
        {confirming ? (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(undefined)}>
            Delete with history
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
