import { useState } from "react";
import { GearSix } from "@phosphor-icons/react";
import { berlinMonth, berlinToday } from "@shared/money";
import { PageHeader } from "@/components/page-header";
import { ManageHabits } from "@/components/planner/manage-habits";
import { MonthSection } from "@/components/planner/month-section";
import { TodayCard } from "@/components/planner/today-card";
import { WinsCard } from "@/components/planner/wins-card";
import { Button } from "@/components/ui/button";
import { useHasExtra } from "@/hooks/me";

export default function PlannerPage() {
  const today = berlinToday();
  const currentMonth = berlinMonth();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(currentMonth);
  const [manage, setManage] = useState(false);
  const showWins = useHasExtra("wins");
  return (
    // min-w-0 all the way down: the 31-day grid must scroll inside its card, not widen the page.
    <div className="grid min-w-0 gap-8">
      <PageHeader title="Planner">
        <Button variant="ghost" size="sm" onClick={() => setManage(true)}>
          <GearSix />
          <span className="hidden sm:inline">Manage habits</span>
        </Button>
      </PageHeader>
      <TodayCard date={date} today={today} onDate={setDate} />
      {showWins && <WinsCard />}
      <MonthSection month={month} currentMonth={currentMonth} onMonth={setMonth} />
      <ManageHabits open={manage} onClose={() => setManage(false)} />
    </div>
  );
}
