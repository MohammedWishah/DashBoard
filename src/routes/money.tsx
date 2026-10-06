import { useRef, useState } from "react";
import { GearSix, Plus } from "@phosphor-icons/react";
import { addMonths, berlinMonth, berlinToday } from "@shared/money";
import { useQuickAdd } from "@/components/app-shell";
import { ChartSkeleton, DebtChart, MonthsChart, PaceChart, WhereChart } from "@/components/money/charts";
import { ExpenseList, type CategoryFilter } from "@/components/money/expense-list";
import { GoalsAndDebts } from "@/components/money/goals-debts";
import { WantList } from "@/components/money/want-list";
import { ManageDialog, type ManageTab } from "@/components/money/manage-dialog";
import { ReviewCard, ReviewSkeleton } from "@/components/money/review";
import { BillsList, CategoryRows, MonthHero, MonthHeroSkeleton, MonthSwitcher, panel } from "@/components/money/summary";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasExtra } from "@/hooks/me";
import { useCharts, useOverview, useReview } from "@/hooks/money";
import { cn } from "@/lib/utils";

const REVIEW_DISMISSED_KEY = "money:review-dismissed";

function readDismissed(): string | null {
  try {
    return localStorage.getItem(REVIEW_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Which month's review to show: the month on screen when it's in the past, or last month
 * during the first week of a new one (until hidden).
 */
function reviewMonthFor(month: string, currentMonth: string, dismissed: string | null): { month: string; nudge: boolean } | null {
  if (month < currentMonth) return { month, nudge: false };
  if (month > currentMonth) return null;
  const last = addMonths(currentMonth, -1);
  return Number(berlinToday().slice(8)) <= 7 && dismissed !== last ? { month: last, nudge: true } : null;
}

export default function MoneyPage() {
  const currentMonth = berlinMonth();
  const [month, setMonth] = useState(currentMonth);
  const overview = useOverview(month);
  const charts = useCharts(month);
  const quickAdd = useQuickAdd();
  const [manage, setManage] = useState<ManageTab | null>(null);
  const showWants = useHasExtra("wants");
  const [filter, setFilter] = useState<CategoryFilter | null>(null);
  const expensesRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const reviewFor = reviewMonthFor(month, currentMonth, dismissed);
  const review = useReview(reviewFor?.month ?? "", reviewFor !== null);
  const o = overview.data;

  function selectCategory(c: CategoryFilter) {
    if (filter?.id === c.id) return setFilter(null);
    setFilter({ id: c.id, name: c.name });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    expensesRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function dismissReview(m: string) {
    setDismissed(m);
    try {
      localStorage.setItem(REVIEW_DISMISSED_KEY, m);
    } catch {
      /* storage unavailable; it shows again next visit */
    }
  }

  const r = review.data;
  const reviewHasData = r && (r.expenseCount > 0 || r.totals.incomeCents > 0);
  // Hold the previous month at reduced opacity while the next one loads, instead of flashing skeletons.
  const switching = overview.isPlaceholderData;

  return (
    <div className="grid gap-8">
      <PageHeader title="Money">
        <Button variant="ghost" size="sm" onClick={() => setManage("categories")}>
          <GearSix />
          <span className="hidden sm:inline">Manage</span>
        </Button>
        <Button size="sm" onClick={() => quickAdd.open()} className="hidden md:inline-flex">
          <Plus weight="bold" />
          Add
        </Button>
      </PageHeader>

      {overview.isError ? (
        <div role="alert" className={cn(panel, "grid justify-items-start gap-3 p-6")}>
          <p className="font-medium">Could not load money</p>
          <p className="text-sm text-muted-foreground">{overview.error.message}</p>
          <Button variant="secondary" size="sm" onClick={() => overview.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className={cn("grid gap-8 transition-opacity", switching && "opacity-60")}>
          <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
            {o ? <MonthHero overview={o} /> : <MonthHeroSkeleton />}
            <MonthSwitcher month={month} currentMonth={currentMonth} onChange={setMonth} />
          </div>

          {reviewFor &&
            (review.isPending ? (
              reviewFor.nudge ? null : <ReviewSkeleton />
            ) : reviewHasData ? (
              <ReviewCard
                review={r}
                showSavedByWaiting={showWants}
                onDismiss={reviewFor.nudge ? () => dismissReview(reviewFor.month) : undefined}
              />
            ) : null)}

          <div className="grid gap-4 lg:grid-cols-12">
            {o ? (
              <>
                <div className="lg:col-span-7">
                  <CategoryRows
                    categories={o.categories}
                    selectedId={filter?.id ?? null}
                    onSelect={selectCategory}
                    onManage={() => setManage("categories")}
                  />
                </div>
                <div className="lg:col-span-5">
                  <BillsList bills={o.bills} today={o.today} onManage={() => setManage("bills")} />
                </div>
              </>
            ) : (
              <>
                <Skeleton className="h-72 rounded-xl lg:col-span-7" />
                <Skeleton className="h-72 rounded-xl lg:col-span-5" />
              </>
            )}
          </div>

          {charts.data ? <PaceChart data={charts.data} /> : <ChartSkeleton />}

          <div className="grid gap-4 lg:grid-cols-2">
            {charts.data ? (
              <>
                <WhereChart data={charts.data} />
                <MonthsChart data={charts.data} />
              </>
            ) : (
              <>
                <ChartSkeleton />
                <ChartSkeleton />
              </>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            {o ? (
              <>
                <div ref={expensesRef} className="scroll-mt-6 lg:col-span-7">
                  <ExpenseList
                    month={o.month}
                    today={o.today}
                    recent={o.recentExpenses}
                    total={o.expenseCount}
                    income={o.income}
                    filter={filter}
                    onClearFilter={() => setFilter(null)}
                    onAdd={() => quickAdd.open()}
                  />
                </div>
                <div className="grid content-start gap-4 lg:col-span-5">
                  {showWants && <WantList />}
                  <GoalsAndDebts goals={o.goals} debts={o.debts} />
                  {charts.data && <DebtChart data={charts.data} />}
                </div>
              </>
            ) : (
              <Skeleton className="h-80 rounded-xl lg:col-span-12" />
            )}
          </div>
        </div>
      )}

      <ManageDialog tab={manage} onClose={() => setManage(null)} />
    </div>
  );
}
