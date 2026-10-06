import { useState } from "react";
import { berlinToday } from "@shared/money";
import { PageHeader } from "@/components/page-header";
import { TodayCard } from "@/components/planner/today-card";

export default function PlannerPage() {
  const today = berlinToday();
  const [date, setDate] = useState(today);
  return (
    <div className="grid gap-8">
      <PageHeader title="Planner" />
      <TodayCard date={date} today={today} onDate={setDate} />
    </div>
  );
}
