import { ClockCounterClockwise, PencilSimple, Plus, RocketLaunch } from "@phosphor-icons/react";
import { MAX_ACTIVE_PROJECTS } from "@shared/rules";
import type { Project } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { touchedAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  projects: Project[];
  onEdit: (p: Project) => void;
  onShip: (p: Project) => void;
  onNew: () => void;
};

export function ActiveBoard({ projects, onEdit, onShip, onNew }: Props) {
  const openSlots = Math.max(0, MAX_ACTIVE_PROJECTS - projects.length);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((p, i) => (
        <ActiveCard key={p.id} project={p} index={i} onEdit={onEdit} onShip={onShip} />
      ))}
      {Array.from({ length: openSlots }, (_, i) => (
        <OpenSlot key={`slot-${i}`} first={i === 0 && projects.length === 0} onNew={onNew} />
      ))}
    </div>
  );
}

function ActiveCard({
  project,
  index,
  onEdit,
  onShip,
}: {
  project: Project;
  index: number;
  onEdit: (p: Project) => void;
  onShip: (p: Project) => void;
}) {
  const pending = project.id.startsWith("temp-");
  return (
    <article
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "group relative flex animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-both duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] min-h-[18rem] flex-col overflow-hidden rounded-xl bg-card p-6 shadow-[inset_0_0_0_1px_var(--border),0_2px_2px_rgba(0,0,0,.25),0_8px_16px_-4px_rgba(0,0,0,.35)] md:p-8",
        pending && "opacity-70",
      )}
    >
      {/* Single hairline of the ship gradient marks a card as an active slot */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-ship-deep/0 via-ship-deep/70 to-ship/80" />

      <header className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-medium text-muted-foreground">{project.name}</h3>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
          {project.stale && <ClockCounterClockwise className="size-3.5 text-ship" aria-label="Stale" />}
          {touchedAgo(project.lastTouched)}
        </span>
      </header>

      <p className="mt-5 text-pretty text-2xl font-semibold leading-snug tracking-tight text-foreground md:text-[1.75rem]">
        {project.nextAction}
      </p>

      {project.doneDefinition && (
        <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
          <span className="text-foreground/80">Done when </span>
          {project.doneDefinition}
        </p>
      )}

      <footer className="mt-auto flex items-center gap-2 pt-8">
        <Button variant="ship" onClick={() => onShip(project)} disabled={pending}>
          <RocketLaunch weight="bold" />
          Ship
        </Button>
        <Button variant="ghost" onClick={() => onEdit(project)} disabled={pending}>
          <PencilSimple />
          Edit
        </Button>
      </footer>
    </article>
  );
}

function OpenSlot({ first, onNew }: { first: boolean; onNew: () => void }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-start justify-center gap-4 rounded-xl border border-dashed border-input p-6 md:p-8">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold tracking-tight">{first ? "Nothing active yet" : "One slot open"}</p>
        <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground">
          Activate a parked project from its edit dialog, or start a new one here.
        </p>
      </div>
      <Button variant="secondary" onClick={onNew}>
        <Plus />
        New project
      </Button>
    </div>
  );
}

export function ActiveBoardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex min-h-[18rem] flex-col rounded-xl bg-card p-6 shadow-[inset_0_0_0_1px_var(--border)] md:p-8">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-6 h-7 w-11/12" />
          <Skeleton className="mt-2 h-7 w-2/3" />
          <Skeleton className="mt-5 h-4 w-1/2" />
          <div className="mt-auto flex gap-2 pt-8">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
