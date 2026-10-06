import { CaretLeft, CaretRight, CheckCircle, Warning, WarningOctagon } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { addMonths, formatEuro } from "@shared/money";
import type { BillThisMonth, CategorySummary, MoneyOverview } from "@shared/money-schemas";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const monthName = (m: string) => format(parseISO(`${m}-01`), "MMMM yyyy");
export const shortDate = (d: string) => format(parseISO(d), "d MMM");

export const panel = "rounded-xl bg-card shadow-[inset_0_0_0_1px_var(--border)]";

export function MonthSwitcher({ month, currentMonth, onChange }: { month: string; currentMonth: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        <CaretLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
        {monthName(month)}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={() => onChange(addMonths(month, 1))} aria-label="Next month">
        <CaretRight />
      </Button>
      {month !== currentMonth && (
        <Button variant="ghost" size="sm" onClick={() => onChange(currentMonth)}>
          This month
        </Button>
      )}
    </div>
  );
}

export function MonthHero({ overview }: { overview: MoneyOverview }) {
  const t = overview.totals;
  const stats = [
    { label: "Income", value: t.incomeCents },
    { label: "Spent", value: t.expenseCents },
    { label: "Saved", value: t.savedCents },
    { label: "Debt paid", value: t.debtPaidCents },
  ];
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <span className="text-sm text-muted-foreground">{overview.isCurrentMonth ? "Left this month" : `Left in ${monthName(overview.month)}`}</span>
        <span className={cn("text-5xl font-semibold leading-none tracking-tight", t.leftCents < 0 && "text-status-critical")}>
          {formatEuro(t.leftCents)}
        </span>
        {t.leftCents < 0 && (
          <span className="mt-1 flex items-center gap-1.5 text-sm">
            <WarningOctagon className="size-4 text-status-critical" weight="fill" />
            Over by {formatEuro(-t.leftCents)}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
        {stats.map((s) => (
          <div key={s.label} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-base font-medium tabular-nums">{formatEuro(s.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MonthHeroSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-12 w-48" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
    </div>
  );
}

// ---- Categories -----------------------------------------------------------

const stateStyle = {
  none: "",
  ok: "bg-foreground/75",
  warn: "bg-status-warning",
  over: "bg-status-critical",
} as const;

export function CategoryRows({
  categories,
  selectedId,
  onSelect,
  onManage,
}: {
  categories: CategorySummary[];
  selectedId: string | null;
  onSelect: (c: CategorySummary) => void;
  onManage: () => void;
}) {
  const anyLimit = categories.some((c) => c.monthlyLimitCents !== null);
  return (
    <section className={cn(panel, "grid content-start gap-1 p-5")}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Categories</h2>
        <Button variant="ghost" size="sm" onClick={onManage}>
          {anyLimit ? "Edit limits" : "Set limits"}
        </Button>
      </header>
      <ul className="-mx-2 grid gap-1">
        {categories.map((c) => (
          <CategoryRow key={c.id} c={c} selected={c.id === selectedId} onSelect={() => onSelect(c)} />
        ))}
      </ul>
      {!anyLimit && (
        <p className="mt-4 text-sm text-muted-foreground">Set a monthly limit on a category to see what's left and get a warning near the end.</p>
      )}
    </section>
  );
}

function CategoryRow({ c, selected, onSelect }: { c: CategorySummary; selected: boolean; onSelect: () => void }) {
  const limit = c.monthlyLimitCents;
  const pct = (n: number) => `${Math.min(100, (n / (limit ?? 1)) * 100)}%`;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "grid w-full gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
          selected && "bg-accent/60",
        )}
      >
        <span className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium">
            {c.name}
            {c.archived && <span className="ml-2 text-xs text-muted-foreground">archived</span>}
          </span>
          <span className="tabular-nums text-muted-foreground">
            <span className="text-foreground">{formatEuro(c.spentCents)}</span>
            {limit !== null && ` of ${formatEuro(limit)}`}
          </span>
        </span>
        {limit !== null && (
          <>
            <span
              className="relative block h-1.5 overflow-hidden rounded-full bg-foreground/10"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={c.spentCents}
              aria-label={`${c.name} spent`}
            >
              {/* Upcoming bills: lighter step of the same fill, after what's already spent */}
              <span className={cn("absolute inset-y-0 left-0 rounded-full opacity-35", stateStyle[c.state])} style={{ width: pct(c.spentCents + c.upcomingCents) }} />
              <span className={cn("absolute inset-y-0 left-0 rounded-full", stateStyle[c.state])} style={{ width: pct(c.spentCents) }} />
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {c.state === "warn" && <Warning className="size-3.5 text-status-warning" weight="fill" />}
              {c.state === "over" && <WarningOctagon className="size-3.5 text-status-critical" weight="fill" />}
              <span>
                <span className={cn(c.state !== "ok" && "text-foreground")}>
                  {c.leftCents! >= 0 ? `${formatEuro(c.leftCents!)} left` : `${formatEuro(-c.leftCents!)} over`}
                </span>
                {c.upcomingCents > 0 && `, after ${formatEuro(c.upcomingCents)} in upcoming bills`}
              </span>
            </span>
          </>
        )}
      </button>
    </li>
  );
}

// ---- Bills ----------------------------------------------------------------

export function BillsList({ bills, today, onManage }: { bills: BillThisMonth[]; today: string; onManage: () => void }) {
  const daysUntil = (d: string) => Math.round((parseISO(d).getTime() - parseISO(today).getTime()) / 86_400_000);
  return (
    <section className={cn(panel, "grid content-start gap-3 p-5")}>
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Bills this month</h2>
        <Button variant="ghost" size="sm" onClick={onManage}>
          Manage
        </Button>
      </header>
      {bills.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No recurring bills. Add rent, gym, or subscriptions and they log themselves on their due day.
        </p>
      ) : (
        <ul className="grid gap-3">
          {bills.map((b) => {
            const n = daysUntil(b.dueOn);
            return (
              <li key={b.id} className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(b.dueOn)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                <span className="tabular-nums">{formatEuro(b.amountCents)}</span>
                <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground">
                  {b.status === "logged" ? (
                    <>
                      <CheckCircle className="size-3.5" weight="fill" />
                      Logged
                    </>
                  ) : n === 1 ? (
                    "Tomorrow"
                  ) : (
                    `In ${n} days`
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
