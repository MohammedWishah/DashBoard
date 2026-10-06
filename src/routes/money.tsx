import { useState } from "react";
import { GearSix, Plus } from "@phosphor-icons/react";
import { berlinMonth } from "@shared/money";
import { useQuickAdd } from "@/components/app-shell";
import { ChartSkeleton, DebtChart, MonthsChart, PaceChart, WhereChart } from "@/components/money/charts";
import { ExpenseList } from "@/components/money/expense-list";
import { GoalsAndDebts } from "@/components/money/goals-debts";
import { WantList } from "@/components/money/want-list";
import { ManageDialog, type ManageTab } from "@/components/money/manage-dialog";
import { BillsList, CategoryRows, MonthHero, MonthHeroSkeleton, MonthSwitcher, panel } from "@/components/money/summary";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasExtra } from "@/hooks/me";
import { useCharts, useOverview } from "@/hooks/money";
import { cn } from "@/lib/utils";

export default function MoneyPage() {
  const currentMonth = berlinMonth();
  const [month, setMonth] = useState(currentMonth);
  const overview = useOverview(month);
  const charts = useCharts(month);
  const quickAdd = useQuickAdd();
  const [manage, setManage] = useState<ManageTab | null>(null);
  const showWants = useHasExtra("wants");
  const o = overview.data;
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

          <div className="grid gap-4 lg:grid-cols-12">
            {o ? (
              <>
                <div className="lg:col-span-7">
                  <CategoryRows categories={o.categories} onManage={() => setManage("categories")} />
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
                <div className="lg:col-span-7">
                  <ExpenseList
                    month={o.month}
                    recent={o.recentExpenses}
                    total={o.expenseCount}
                    income={o.income}
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
