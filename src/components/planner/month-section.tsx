import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Fire } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import type { MonthView } from "@shared/planner-schemas";
import { ChartCard, ChartSkeleton } from "@/components/money/charts";
import { MonthSwitcher, panel } from "@/components/money/summary";
import { TickBox } from "@/components/planner/today-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonth, useToggleCheck } from "@/hooks/planner";
import { cn } from "@/lib/utils";

const pct = (p: number | null) => (p === null ? "–" : `${p}%`);

export function MonthSection({ month, currentMonth, onMonth }: { month: string; currentMonth: string; onMonth: (m: string) => void }) {
  const q = useMonth(month);
  const m = q.data;
  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="month-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="month-title" className="text-base font-semibold">
          Month
        </h2>
        <MonthSwitcher month={month} currentMonth={currentMonth} onChange={onMonth} />
      </div>
      {!m ? (
        <>
          <Skeleton className="h-64 rounded-xl" />
          <ChartSkeleton />
        </>
      ) : (
        <div className={cn("grid min-w-0 gap-4", q.isPlaceholderData && "opacity-60")}>
          <DailyGrid m={m} />
          <ProgressChart m={m} />
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <WeeklyGrid m={m} />
            <MonthlyList m={m} />
          </div>
          <TopHabits m={m} />
        </div>
      )}
    </section>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className={cn(panel, "grid min-w-0 content-start gap-3 p-5")}>
      <div className="grid gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function DailyGrid({ m }: { m: MonthView }) {
  const toggle = useToggleCheck();
  if (m.daily.length === 0) {
    return (
      <Card title="Daily habits">
        <p className="text-sm text-muted-foreground">No daily habits yet.</p>
      </Card>
    );
  }
  return (
    <Card title="Daily habits" subtitle="Click a square to tick or untick that day">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card pr-3 text-left font-medium">Habit</th>
              {m.days.map((d) => (
                <th key={d} className={cn("w-5 text-center font-normal tabular-nums", d === m.today && "text-foreground")}>
                  {Number(d.slice(8))}
                </th>
              ))}
              <th className="pl-2 text-right font-medium">%</th>
              <th className="pl-2 text-right font-medium">Streak</th>
            </tr>
          </thead>
          <tbody>
            {m.daily.map((r) => {
              const set = new Set(r.checks);
              return (
                <tr key={r.habit.id}>
                  <th scope="row" className="sticky left-0 z-10 bg-card pr-3 text-left text-sm font-normal">
                    <span className="block max-w-36 truncate" title={r.habit.name}>
                      {r.habit.name}
                    </span>
                    {r.total !== null && <span className="block text-[11px] text-muted-foreground">{r.total} done</span>}
                  </th>
                  {m.days.map((d) => (
                    <td key={d} className={cn("p-0", d === m.today && "rounded-[6px] shadow-[inset_0_0_0_1px_var(--ring)]")}>
                      <TickBox
                        className="size-5"
                        checked={set.has(d)}
                        disabled={d > m.today}
                        label={`${r.habit.name}, ${format(parseISO(d), "d MMM")}`}
                        onChange={(checked) => toggle.mutate({ habitId: r.habit.id, frequency: "daily", date: d, checked })}
                      />
                    </td>
                  ))}
                  <td className="pl-2 text-right tabular-nums">{pct(r.percent)}</td>
                  <td className="pl-2 text-right tabular-nums">
                    {r.atRisk && (
                      <span className="mr-1 text-status-warning" title="Missed yesterday, tick today to keep it">
                        ●<span className="sr-only">at risk</span>
                      </span>
                    )}
                    {r.streak > 0 ? (
                      <span className="inline-flex items-center gap-0.5">
                        <Fire weight="fill" className="text-primary" />
                        {r.streak}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const progressConfig = { percent: { label: "Done", color: "var(--primary)" } } satisfies ChartConfig;

function ProgressChart({ m }: { m: MonthView }) {
  const rows = m.dayPercents.map((d) => ({ day: Number(d.date.slice(8)), percent: d.percent }));
  return (
    <ChartCard
      className="min-w-0"
      title="Daily progress"
      subtitle="Share of daily habits done each day"
      table={{ head: ["Day", "Done"], rows: m.dayPercents.filter((d) => d.percent !== null).map((d) => [format(parseISO(d.date), "d MMM"), `${d.percent}%`]) }}
    >
      {m.daily.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Add daily habits to see your progress.</p>
      ) : (
        <ChartContainer config={progressConfig} className="aspect-auto h-48 w-full">
          <BarChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
            <YAxis stroke="var(--chart-axis)" fontSize={11} tickLine={false} axisLine={false} width={36} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={<ChartTooltipContent valueFormatter={(v) => `${v}%`} labelFormatter={(_, p) => `Day ${p?.[0]?.payload?.day}`} />}
            />
            <Bar dataKey="percent" fill="var(--color-percent)" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

function WeeklyGrid({ m }: { m: MonthView }) {
  const toggle = useToggleCheck();
  return (
    <Card title="Weekly habits" subtitle="One box per week (weeks start on Monday)">
      {m.weekly.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weekly habits yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="pr-3 text-left font-medium">Habit</th>
                {m.mondays.map((d) => (
                  <th key={d} className="text-center font-normal">
                    {format(parseISO(d), "d MMM")}
                  </th>
                ))}
                <th className="pl-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {m.weekly.map((r) => (
                <tr key={r.habit.id}>
                  <th scope="row" className="pr-3 text-left text-sm font-normal">
                    <span className="block max-w-36 truncate" title={r.habit.name}>
                      {r.habit.name}
                    </span>
                    {r.total !== null && <span className="block text-[11px] text-muted-foreground">{r.total} done</span>}
                  </th>
                  {r.weeks.map((w) => (
                    <td key={w.monday} className="text-center">
                      <TickBox
                        className="mx-auto"
                        checked={w.checked}
                        disabled={w.monday > m.today}
                        label={`${r.habit.name}, week of ${format(parseISO(w.monday), "d MMM")}`}
                        onChange={(checked) => toggle.mutate({ habitId: r.habit.id, frequency: "weekly", date: w.monday, checked })}
                      />
                    </td>
                  ))}
                  <td className="pl-2 text-right tabular-nums">{pct(r.percent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MonthlyList({ m }: { m: MonthView }) {
  const toggle = useToggleCheck();
  const first = `${m.month}-01`;
  return (
    <Card title="Monthly habits" subtitle={format(parseISO(first), "MMMM yyyy")}>
      {m.monthly.length === 0 ? (
        <p className="text-sm text-muted-foreground">No monthly habits yet.</p>
      ) : (
        <ul className="grid gap-2">
          {m.monthly.map((r) => (
            <li key={r.habit.id} className="flex items-center gap-2 text-sm">
              <TickBox
                checked={r.checked}
                disabled={first > m.today}
                label={`${r.habit.name}: ${r.checked ? "untick" : "tick"}`}
                onChange={(checked) => toggle.mutate({ habitId: r.habit.id, frequency: "monthly", date: first, checked })}
              />
              <span className={cn(r.checked && "text-muted-foreground")}>{r.habit.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopHabits({ m }: { m: MonthView }) {
  return (
    <Card title="Top habits" subtitle="Best 10 this month, by share done">
      {m.top.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tick some habits to see a ranking.</p>
      ) : (
        <ol className="grid gap-2">
          {m.top.map((t, i) => (
            <li key={t.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
              <span className="tabular-nums text-muted-foreground">{i + 1}</span>
              <div className="grid gap-1">
                <span className="truncate">
                  {t.name} <span className="text-xs text-muted-foreground">{t.frequency}</span>
                </span>
                <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${t.percent ?? 0}%` }} />
                </div>
              </div>
              <span className="text-right tabular-nums">{pct(t.percent)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
