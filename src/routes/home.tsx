import { ArrowRight, Plus } from "@phosphor-icons/react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { berlinMonth, formatEuro } from "@shared/money";
import { useQuickAdd } from "@/components/app-shell";
import { panel } from "@/components/money/summary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeToday } from "@/components/planner/home-today";
import { useHasExtra, useMe } from "@/hooks/me";
import { useOverview } from "@/hooks/money";
import { useProjects } from "@/hooks/queries";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const me = useMe().data;
  const hasMoney = Boolean(me?.features.includes("money"));
  const hasProjects = Boolean(me?.features.includes("projects"));
  const hasPlanner = Boolean(me?.features.includes("planner"));
  const showToday = useHasExtra("home_today");
  const overview = useOverview(berlinMonth(), hasMoney);
  const projects = useProjects(hasProjects);
  const quickAdd = useQuickAdd();
  const o = overview.data;
  const active = (projects.data ?? []).filter((p) => p.status === "active");
  const today = format(new Date(), "EEEE, d MMMM");

  return (
    <div className="grid gap-8">
      <div className="flex min-h-14 items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{today}</h1>
        {hasMoney && (
          <Button size="sm" onClick={() => quickAdd.open()} className="hidden md:inline-flex">
            <Plus weight="bold" />
            Add expense
          </Button>
        )}
      </div>

      {me && !hasMoney && !hasProjects && !hasPlanner && (
        <p className={cn(panel, "p-6 text-sm text-muted-foreground")}>
          Nothing is switched on for you yet. Ask the admin.
        </p>
      )}

      {showToday && <HomeToday />}

      <div className="grid gap-4 md:grid-cols-5">
        {/* Money: the one hero figure on this screen */}
        {hasMoney && (
          <>
            <Link
              href="/money"
              className={cn(
                panel,
                "group grid content-between gap-8 p-6 transition-colors hover:bg-accent/40 md:col-span-3 md:row-span-2",
              )}
            >
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Left this month</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
              {o ? (
                <div className="grid gap-4">
                  <span
                    className={cn(
                      "text-5xl font-semibold leading-none tracking-tight md:text-6xl",
                      o.totals.leftCents < 0 && "text-status-critical",
                    )}
                  >
                    {formatEuro(o.totals.leftCents)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatEuro(o.totals.expenseCents)} spent of {formatEuro(o.totals.incomeCents)} income
                  </span>
                </div>
              ) : overview.isError ? (
                <span className="text-sm text-destructive">{overview.error.message}</span>
              ) : (
                <div className="grid gap-3">
                  <Skeleton className="h-14 w-56" />
                  <Skeleton className="h-4 w-40" />
                </div>
              )}
            </Link>

            <section className={cn(panel, "grid content-start gap-2 p-6 md:col-span-2")}>
              <h2 className="text-sm text-muted-foreground">Next bill</h2>
              {!o ? (
                <Skeleton className="h-6 w-40" />
              ) : o.nextBill ? (
                <>
                  <p className="text-lg font-semibold tracking-tight">
                    {o.nextBill.name} {formatEuro(o.nextBill.amountCents)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Due {format(parseISO(o.nextBill.dueOn), "EEEE d MMMM")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No more bills this month.</p>
              )}
            </section>
          </>
        )}

        {hasProjects && (
          <section className={cn(panel, "grid content-start gap-3 p-6", hasMoney ? "md:col-span-2" : "md:col-span-5")}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm text-muted-foreground">Next actions</h2>
              <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground">
                Projects
              </Link>
            </div>
            {projects.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active projects.</p>
            ) : (
              <ul className="grid gap-3">
                {active.map((p) => (
                  <li key={p.id} className="grid gap-0.5">
                    <span className="text-xs text-muted-foreground">{p.name}</span>
                    <span className="text-sm font-medium leading-snug">{p.nextAction}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {o && o.categories.some((c) => c.state === "warn" || c.state === "over") && (
        <section className={cn(panel, "grid gap-2 p-5")}>
          <h2 className="text-sm font-semibold">Watch these categories</h2>
          <ul className="grid gap-1 text-sm">
            {o.categories
              .filter((c) => c.state === "warn" || c.state === "over")
              .map((c) => (
                <li key={c.id} className="flex justify-between gap-3">
                  <span>{c.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.leftCents! >= 0 ? `${formatEuro(c.leftCents!)} left` : `${formatEuro(-c.leftCents!)} over`}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
