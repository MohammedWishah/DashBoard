import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { FREQUENCIES, TIMES_OF_DAY, type Frequency, type TimeOfDay } from "@shared/planner";
import type { HabitRow } from "@shared/planner-schemas";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useHasExtra } from "@/hooks/me";
import { useHabits, usePlannerAction } from "@/hooks/planner";
import { plannerApi } from "@/lib/planner-api";

const LABEL: Record<Frequency, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const TIME_LABEL: Record<TimeOfDay, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Anytime" };

export function ManageHabits({ open, onClose }: { open: boolean; onClose: () => void }) {
  const habits = useHabits();
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [name, setName] = useState("");
  const showTiny = useHasExtra("tiny_habits");
  const showTime = useHasExtra("time_of_day");
  const create = usePlannerAction((v: { name: string; frequency: Frequency }) => plannerApi.createHabit(v), "Habit added");
  const reorder = usePlannerAction((ids: string[]) => plannerApi.reorder(ids));
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
            <HabitEditor
              key={h.id}
              habit={h}
              canUp={i > 0}
              canDown={i < active.length - 1}
              onMove={(dir) => {
                // Send the whole order: reliable even when two habits share a position.
                const ids = active.map((x) => x.id);
                const j = i + dir;
                [ids[i], ids[j]] = [ids[j], ids[i]];
                reorder.mutate(ids);
              }}
              showTiny={showTiny}
              showTime={showTime}
            />
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

function HabitEditor({
  habit,
  canUp,
  canDown,
  onMove,
  showTiny,
  showTime,
}: {
  habit: HabitRow;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
  showTiny: boolean;
  showTime: boolean;
}) {
  const [name, setName] = useState(habit.name);
  const [tiny, setTiny] = useState(habit.tiny ?? "");
  const update = usePlannerAction((patch: Parameters<typeof plannerApi.updateHabit>[1]) => plannerApi.updateHabit(habit.id, patch));
  const archive = usePlannerAction(() => plannerApi.updateHabit(habit.id, { archived: true }), `${habit.name} archived`);

  function saveName() {
    const n = name.trim();
    if (!n) return setName(habit.name);
    if (n !== habit.name) update.mutate({ name: n }, { onError: () => setName(habit.name) });
  }

  function saveTiny() {
    const t = tiny.trim();
    if (t !== (habit.tiny ?? "")) update.mutate({ tiny: t }, { onError: () => setTiny(habit.tiny ?? "") });
  }

  return (
    <li className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={80}
          className="h-8"
          aria-label={`Rename ${habit.name}`}
        />
        {showTime && (
          <select
            value={habit.timeOfDay}
            onChange={(e) => update.mutate({ timeOfDay: e.target.value as TimeOfDay })}
            aria-label={`When to do ${habit.name}`}
            className="h-8 rounded-md bg-transparent px-2 text-xs text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)]"
          >
            {TIMES_OF_DAY.map((t) => (
              <option key={t} value={t}>
                {TIME_LABEL[t]}
              </option>
            ))}
          </select>
        )}
        <Button variant="ghost" size="icon-sm" disabled={!canUp} onClick={() => onMove(-1)} aria-label={`Move ${habit.name} up`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={!canDown} onClick={() => onMove(1)} aria-label={`Move ${habit.name} down`}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => archive.mutate(undefined)} className="text-muted-foreground">
          Archive
        </Button>
      </div>
      {showTiny && (
        <Input
          value={tiny}
          onChange={(e) => setTiny(e.target.value)}
          onBlur={saveTiny}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={80}
          placeholder="Tiny version for bad days, e.g. 1 page"
          className="h-8 text-xs"
          aria-label={`Tiny version of ${habit.name}`}
        />
      )}
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
