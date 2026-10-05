import { useState } from "react";
import { toast } from "sonner";
import { ListChecks, Plus } from "@phosphor-icons/react";
import type { Stats } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveHours } from "@/hooks/queries";

type Props = {
  stats: Stats | undefined;
  statsLoading: boolean;
  onNew: () => void;
  onReview: () => void;
};

export function TopBar({ stats, statsLoading, onNew, onReview }: Props) {
  return (
    <header className="grid gap-8">
      <PageHeader title="Projects">
        <Button variant="secondary" size="sm" onClick={onReview} className="hidden sm:inline-flex">
          <ListChecks />
          Weekly review
        </Button>
        <Button variant="secondary" size="icon-sm" onClick={onReview} className="sm:hidden" aria-label="Weekly review">
          <ListChecks />
        </Button>
        <Button size="sm" onClick={onNew}>
          <Plus weight="bold" />
          <span className="hidden sm:inline">New project</span>
          <span className="sm:hidden">New</span>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-start gap-x-14 gap-y-6">
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground">Shipped this week</span>
          {statsLoading ? (
            <Skeleton className="h-12 w-16" />
          ) : (
            <span className="text-5xl font-semibold leading-none tracking-tight">
              {stats?.shippedThisWeek ?? 0}
            </span>
          )}
        </div>
        <HoursEditor stats={stats} loading={statsLoading} />
      </div>
    </header>
  );
}

function HoursEditor({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  const saved = stats?.availableHoursThisWeek ?? null;
  const [draft, setDraft] = useState<string | null>(null);
  const save = useSaveHours();
  const value = draft ?? (saved === null ? "" : String(saved));

  function commit() {
    if (draft === null) return;
    const hours = Number(draft);
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(hours) || hours < 0 || hours > 168) {
      if (draft.trim() !== "") toast.error("Hours must be between 0 and 168.");
      return;
    }
    if (hours !== saved) save.mutate(hours);
  }

  return (
    <div className="grid gap-1">
      <label htmlFor="hours" className="text-sm text-muted-foreground">
        Hours available this week
      </label>
      {loading ? (
        <Skeleton className="h-12 w-24" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <input
            id="hours"
            type="number"
            inputMode="decimal"
            min={0}
            max={168}
            step={0.5}
            placeholder="0"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            style={{ width: `${Math.max(1, value.length || 1) + 0.6}ch` }}
            className="-mx-1 rounded-md bg-transparent px-1 text-5xl font-semibold leading-none tracking-tight text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:bg-accent/60 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <span className="text-lg text-muted-foreground">h</span>
        </div>
      )}
    </div>
  );
}
