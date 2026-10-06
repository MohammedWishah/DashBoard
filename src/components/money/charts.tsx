import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { formatEuro } from "@shared/money";
import type { MoneyCharts } from "@shared/money-schemas";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

// Chart values are euros (cents / 100) so axes read naturally; tooltips format them back to currency.
const euros = (cents: number | null) => (cents === null ? null : cents / 100);
const fmt = (v: number) => formatEuro(Math.round(v * 100));
const compact = (v: number) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `€${v}`);
const monthLabel = (m: string) => format(parseISO(`${m}-01`), "MMM");

const axis = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid vertical={false} stroke="var(--chart-grid)" />;

export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={cn("grid content-start gap-4 rounded-xl bg-card p-5 shadow-[inset_0_0_0_1px_var(--border)]", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showTable ? "Chart" : "Table"}
        </button>
      </header>
      {showTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={cn("pb-2 font-medium", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {table.rows.map((row, r) => (
                <tr key={r} className="border-t border-border/60">
                  {row.map((cell, i) => (
                    <td key={i} className={cn("py-1.5", i > 0 && "text-right")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 rounded-xl bg-card p-5 shadow-[inset_0_0_0_1px_var(--border)]", className)}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

// ---- Spending pace --------------------------------------------------------

const paceConfig = {
  spent: { label: "Spent", color: "var(--chart-1)" },
  budget: { label: "On budget", color: "var(--chart-axis)" },
} satisfies ChartConfig;

export function PaceChart({ data, className }: { data: MoneyCharts; className?: string }) {
  const rows = data.pace.map((p) => ({ day: p.day, spent: euros(p.spentCents), budget: euros(p.budgetCents) }));
  return (
    <ChartCard
      className={className}
      title="Spending pace"
      subtitle={
        data.hasBudget
          ? "Spending in categories with a limit, against their combined limit"
          : "Total spending this month. Set category limits to see a budget line."
      }
      table={{
        head: data.hasBudget ? ["Day", "Spent", "On budget"] : ["Day", "Spent"],
        rows: rows
          .filter((r) => r.spent !== null)
          .map((r) => (data.hasBudget ? [r.day, fmt(r.spent!), fmt(r.budget!)] : [r.day, fmt(r.spent!)])),
      }}
    >
      <ChartContainer config={paceConfig} className="aspect-auto h-56 w-full">
        <LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          {grid}
          <XAxis dataKey="day" {...axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axis} width={44} tickFormatter={compact} />
          <ChartTooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={<ChartTooltipContent indicator="line" valueFormatter={fmt} labelFormatter={(_, p) => `Day ${p?.[0]?.payload?.day}`} />}
          />
          {data.hasBudget && (
            <Line dataKey="budget" type="linear" stroke="var(--color-budget)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
          <Line
            dataKey="spent"
            type="linear"
            stroke="var(--color-spent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {data.hasBudget && <ChartLegend content={<ChartLegendContent />} />}
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ---- Where it went --------------------------------------------------------

const whereConfig = { spent: { label: "Spent", color: "var(--chart-1)" } } satisfies ChartConfig;

export function WhereChart({ data, className }: { data: MoneyCharts; className?: string }) {
  const rows = data.byCategory.map((c) => ({ name: c.name, spent: c.spentCents / 100 }));
  return (
    <ChartCard
      className={className}
      title="Where it went"
      subtitle="Spending by category this month"
      table={{ head: ["Category", "Spent"], rows: rows.map((r) => [r.name, fmt(r.spent)]) }}
    >
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No spending this month yet.</p>
      ) : (
        <ChartContainer config={whereConfig} className="aspect-auto w-full" style={{ height: Math.max(120, rows.length * 36 + 16) }}>
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 72, top: 0, bottom: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" {...axis} width={84} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <ChartTooltip cursor={{ fill: "var(--accent)" }} content={<ChartTooltipContent hideLabel valueFormatter={fmt} />} />
            <Bar dataKey="spent" fill="var(--color-spent)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
              <LabelList dataKey="spent" position="right" formatter={(v) => fmt(Number(v))} className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  );
}

// ---- Last 6 months --------------------------------------------------------

const monthsConfig = {
  spent: { label: "Spent", color: "var(--chart-1)" },
  income: { label: "Income", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function MonthsChart({ data, className }: { data: MoneyCharts; className?: string }) {
  const rows = data.months.map((m) => ({ month: m.month, spent: m.expenseCents / 100, income: m.incomeCents / 100 }));
  return (
    <ChartCard
      className={className}
      title="Last 6 months"
      subtitle="Income and spending per month"
      table={{
        head: ["Month", "Income", "Spent"],
        rows: rows.map((r) => [format(parseISO(`${r.month}-01`), "MMM yyyy"), fmt(r.income), fmt(r.spent)]),
      }}
    >
      <ChartContainer config={monthsConfig} className="aspect-auto h-56 w-full">
        <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }} barGap={2} barCategoryGap="28%">
          {grid}
          <XAxis dataKey="month" {...axis} tickFormatter={monthLabel} />
          <YAxis {...axis} width={44} tickFormatter={compact} />
          <ChartTooltip
            cursor={{ fill: "var(--accent)" }}
            content={
              <ChartTooltipContent
                valueFormatter={fmt}
                labelFormatter={(_, p) => format(parseISO(`${p?.[0]?.payload?.month}-01`), "MMMM yyyy")}
              />
            }
          />
          <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          <Bar dataKey="spent" fill="var(--color-spent)" radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
          <ChartLegend content={<ChartLegendContent />} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}

// ---- Debt balances --------------------------------------------------------

const DEBT_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export function DebtChart({ data, className }: { data: MoneyCharts; className?: string }) {
  // Four validated slots; more debts would need a 5th hue, so extra ones stay in the table only.
  const debts = data.debts.slice(0, DEBT_SLOTS.length);
  if (debts.length === 0) return null;

  // Merge every debt's dates; carry each balance forward so the lines step down on payment days.
  const dates = [...new Set(debts.flatMap((d) => d.points.map((p) => p.date)))].sort();
  const rows = dates.map((date) => {
    const row: Record<string, string | number | null> = { date };
    for (const d of debts) {
      const last = d.points.filter((p) => p.date <= date).at(-1);
      row[d.id] = last ? last.balanceCents / 100 : null;
    }
    return row;
  });
  const config = Object.fromEntries(debts.map((d, i) => [d.id, { label: d.name, color: DEBT_SLOTS[i] }])) satisfies ChartConfig;

  return (
    <ChartCard
      className={className}
      title="Debt balance"
      subtitle="What you still owe, after each payment"
      table={{
        head: ["Date", ...data.debts.map((d) => d.name)],
        rows: rows.map((r) => [
          format(parseISO(String(r.date)), "d MMM yyyy"),
          ...data.debts.map((d) => (typeof r[d.id] === "number" ? fmt(r[d.id] as number) : "")),
        ]),
      }}
    >
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
          {grid}
          <XAxis dataKey="date" {...axis} tickFormatter={(d) => format(parseISO(d), "MMM")} minTickGap={24} />
          <YAxis {...axis} width={44} tickFormatter={compact} />
          <ChartTooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                indicator="line"
                valueFormatter={fmt}
                labelFormatter={(_, p) => format(parseISO(String(p?.[0]?.payload?.date)), "d MMM yyyy")}
              />
            }
          />
          {debts.map((d) => (
            <Line
              key={d.id}
              dataKey={d.id}
              type="stepAfter"
              stroke={`var(--color-${d.id})`}
              strokeWidth={2}
              dot={{ r: 4, fill: `var(--color-${d.id})`, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          {debts.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        </LineChart>
      </ChartContainer>
    </ChartCard>
  );
}
