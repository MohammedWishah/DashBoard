import { useState } from "react";
import { CaretLeft, CaretRight, Trophy } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { berlinToday, formatEuro } from "@shared/money";
import { addDays, mondayOf } from "@shared/planner";
import { panel } from "@/components/money/summary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWins } from "@/hooks/planner";
import { cn } from "@/lib/utils";

const short = (d: string) => format(parseISO(d), "EEE");

export function WinsCard() {
  const thisWeek = mondayOf(berlinToday());
  const [week, setWeek] = useState(thisWeek);
  const q = useWins(week);
  const w = q.data;
  return (
    <section className={cn(panel, "grid min-w-0 gap-4 p-5")} aria-labelledby="wins-title">
      <header className="flex items-center justify-between gap-2">
        <h2 id="wins-title" className="flex items-center gap-2 text-base font-semibold">
          <Trophy weight="fill" className="text-primary" />
          Wins {week === thisWeek ? "this week" : `· week of ${format(parseISO(week), "d MMM")}`}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            <CaretLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={week >= thisWeek} onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
            <CaretRight />
          </Button>
        </div>
      </header>
      {!w ? (
        <Skeleton className="h-24 w-full" />
      ) : w.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {week === thisWeek ? "Nothing yet this week. Tick one thing and it shows up here." : "Nothing logged that week."}
        </p>
      ) : (
        <div className={cn("grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start", q.isPlaceholderData && "opacity-60")}>
          <div className="grid">
            <span className="text-5xl font-semibold leading-none tracking-tight tabular-nums">{w.total}</span>
            <span className="text-xs text-muted-foreground">wins{w.dailyPercent !== null && ` · habits ${w.dailyPercent}%`}</span>
          </div>
          <ul className="grid gap-1.5 text-sm">
            {w.tasksDone.length > 0 && (
              <li>
                <span className="text-muted-foreground">Top 3 done · </span>
                {w.tasksDone.map((t) => `${t.text} (${short(t.day)})`).join(", ")}
              </li>
            )}
            {w.habits.length > 0 && (
              <li>
                <span className="text-muted-foreground">Habits kept · </span>
                {w.habits.map((h) => `${h.name} ×${h.count}`).join(", ")}
              </li>
            )}
            {w.shipped && w.shipped.length > 0 && (
              <li>
                <span className="text-muted-foreground">Shipped · </span>
                {w.shipped.map((s) => s.project).join(", ")}
              </li>
            )}
            {w.noSpendDays && w.noSpendDays.length > 0 && (
              <li>
                <span className="text-muted-foreground">No-spend days · </span>
                {w.noSpendDays.map(short).join(", ")}
              </li>
            )}
            {w.skipped && w.skipped.length > 0 && (
              <li>
                <span className="text-muted-foreground">Skipped buys · </span>
                {w.skipped.map((s) => `${s.name} (saved ${formatEuro(s.priceCents)})`).join(", ")}
              </li>
            )}
          </ul>
        </div>
      )}
      {w?.insight && <p className="text-sm text-muted-foreground">{w.insight}</p>}
    </section>
  );
}
