import { CaretRight } from "@phosphor-icons/react";
import type { Project } from "@shared/schemas";
import { Skeleton } from "@/components/ui/skeleton";
import { daysUntouched, touchedAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  projects: Project[];
  onEdit: (p: Project) => void;
  /** Stale view shows untouched days and status instead of relative time. */
  variant?: "parked" | "stale";
  empty: { title: string; body: string };
};

export function ProjectList({ projects, onEdit, variant = "parked", empty }: Props) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-input px-6 py-14 text-center">
        <p className="font-medium">{empty.title}</p>
        <p className="mx-auto mt-1.5 max-w-[44ch] text-sm text-muted-foreground">{empty.body}</p>
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl bg-card shadow-[inset_0_0_0_1px_var(--border)]">
      {projects.map((p, i) => (
        <li key={p.id} className={cn(i > 0 && "border-t border-border/70")}>
          <button
            type="button"
            onClick={() => onEdit(p)}
            disabled={p.id.startsWith("temp-")}
            className="group flex w-full items-center gap-4 px-4 py-3.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 disabled:opacity-60 sm:px-5"
          >
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex items-center gap-2 truncate text-sm font-medium">
                {p.name}
                {variant === "stale" && p.status === "active" && (
                  <span className="rounded-sm bg-ship/15 px-1.5 py-px text-[11px] font-medium text-ship">active</span>
                )}
              </span>
              <span className="truncate text-sm text-muted-foreground">{p.nextAction}</span>
            </div>
            <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">
              {variant === "stale" ? `${daysUntouched(p.lastTouched)} days untouched` : touchedAgo(p.lastTouched)}
            </span>
            <CaretRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ProjectListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-[inset_0_0_0_1px_var(--border)]">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("grid gap-2 px-5 py-4", i > 0 && "border-t border-border/70")}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
