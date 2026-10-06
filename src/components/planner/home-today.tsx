import { ArrowRight } from "@phosphor-icons/react";
import { Link } from "wouter";
import { berlinToday } from "@shared/money";
import { panel } from "@/components/money/summary";
import { EnergyChips } from "@/components/planner/energy-chips";
import { HabitChecklist, TopThree } from "@/components/planner/today-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasExtra } from "@/hooks/me";
import { useDay } from "@/hooks/planner";
import { cn } from "@/lib/utils";

/** The day at a glance on Home: top 3 and what's left to tick. Shown with the "Today on Home" extra. */
export function HomeToday() {
  const today = berlinToday();
  const day = useDay(today);
  const d = day.data;
  const open = d
    ? {
        weekly: d.habits.weekly.filter((h) => !h.checked),
        monthly: d.habits.monthly.filter((h) => !h.checked),
      }
    : null;
  const showTiny = useHasExtra("tiny_habits");
  const groupByTime = useHasExtra("time_of_day");
  const showEnergy = useHasExtra("energy");
  return (
    <section className={cn(panel, "grid min-w-0 gap-5 p-6")} aria-labelledby="home-today">
      <div className="flex items-center justify-between">
        <h2 id="home-today" className="text-sm text-muted-foreground">
          Today
        </h2>
        <Link href="/planner" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          Open Planner <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {showEnergy && d && <EnergyChips date={d.date} level={d.energy} />}
      {!d || !open ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <TopThree key={d.date} day={d} />
          <div className="grid content-start gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Habits</h3>
            {d.habits.daily.length + open.weekly.length + open.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing left to tick. Nice.</p>
            ) : (
              <>
                {d.habits.daily.length > 0 && <HabitChecklist habits={d.habits.daily} date={d.date} showTiny={showTiny} groupByTime={groupByTime} />}
                {open.weekly.length > 0 && <HabitChecklist title="This week" habits={open.weekly} date={d.date} showTiny={showTiny} />}
                {open.monthly.length > 0 && <HabitChecklist title="This month" habits={open.monthly} date={d.date} showTiny={showTiny} />}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
