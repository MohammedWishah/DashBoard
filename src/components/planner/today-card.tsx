import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight, Check, Fire, WarningCircle } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { MAX_DAY_TASKS, addDays, mondayOf } from "@shared/planner";
import type { DayHabit, DayView } from "@shared/planner-schemas";
import { panel } from "@/components/money/summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDay, useSaveTasks, useToggleCheck } from "@/hooks/planner";
import { cn } from "@/lib/utils";

export function TodayCard({ date, today, onDate }: { date: string; today: string; onDate: (d: string) => void }) {
  const day = useDay(date);
  const d = day.data;
  const dailyDone = d ? d.habits.daily.filter((h) => h.checked).length : 0;
  const sameWeek = mondayOf(date) === mondayOf(today);
  const sameMonth = date.slice(0, 7) === today.slice(0, 7);
  return (
    <section className={cn(panel, "grid min-w-0 gap-5 p-5")} aria-labelledby="today-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-title" className="text-base font-semibold">
          {date === today ? "Today" : format(parseISO(date), "EEEE")} · {format(parseISO(date), "d MMM")}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => onDate(addDays(date, -1))} aria-label="Previous day">
            <CaretLeft />
          </Button>
          <Button variant="ghost" size="sm" disabled={date === today} onClick={() => onDate(today)}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={date >= today} onClick={() => onDate(addDays(date, 1))} aria-label="Next day">
            <CaretRight />
          </Button>
        </div>
      </header>
      {!d ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className={cn("grid gap-6 md:grid-cols-2", day.isPlaceholderData && "opacity-60")}>
          <TopThree key={d.date} day={d} />
          <div className="grid content-start gap-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Habits</h3>
              {d.habits.daily.length > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {dailyDone}/{d.habits.daily.length}
                </span>
              )}
            </div>
            {d.habits.daily.length + d.habits.weekly.length + d.habits.monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No habits yet. Add some with Manage habits.</p>
            ) : (
              <>
                <HabitChecklist habits={d.habits.daily} date={d.date} />
                {d.habits.weekly.length > 0 && <HabitChecklist title={sameWeek ? "This week" : "That week"} habits={d.habits.weekly} date={d.date} />}
                {d.habits.monthly.length > 0 && <HabitChecklist title={sameMonth ? "This month" : "That month"} habits={d.habits.monthly} date={d.date} />}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function TopThree({ day }: { day: DayView }) {
  // Typing and ticking both save the whole list through one queued mutation, so saves land in
  // order and a tick never races an edit (the server re-creates rows on every save).
  const save = useSaveTasks();
  const pending = useRef(false);
  pending.current = save.isPending;
  const savedKey = JSON.stringify(clean(slots(day)));
  const lastSent = useRef(savedKey);
  const [drafts, setDrafts] = useState(() => slots(day));
  // Take the server's list when it changes from elsewhere (e.g. Hermes), but never while our
  // own saves are in flight: their echoes would wipe what the user is typing.
  useEffect(() => {
    // Our own save coming back (or one still in flight): keep what the user is typing.
    if (pending.current || savedKey === lastSent.current) return;
    lastSent.current = savedKey;
    setDrafts(slots(day));
  }, [savedKey]);

  function persist(next: Draft[]) {
    const tasks = clean(next);
    const key = JSON.stringify(tasks);
    if (key === lastSent.current) return;
    lastSent.current = key;
    save.mutate({ date: day.date, tasks });
  }

  // Autosave 800 ms after typing stops, so nothing is lost when leaving the page.
  useEffect(() => {
    const t = setTimeout(() => persist(drafts), 800);
    return () => clearTimeout(t);
  }, [drafts]);

  function setDone(i: number, done: boolean) {
    const next = drafts.map((x, j) => (j === i ? { ...x, done } : x));
    setDrafts(next);
    persist(next);
  }

  return (
    <div className="grid content-start gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Top 3</h3>
      {drafts.map((t, i) => {
        const text = t.text.trim();
        return (
          <div key={i} className="flex items-center gap-2">
            <TickBox
              checked={t.done}
              disabled={!text}
              label={text ? `Mark "${text}" ${t.done ? "not done" : "done"}` : "Write a task first"}
              onChange={(done) => setDone(i, done)}
            />
            <Input
              value={t.text}
              onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              onBlur={() => persist(drafts)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder={i === 0 ? "Most important thing today" : "Optional"}
              maxLength={200}
              aria-label={`Top ${i + 1}`}
              className={cn("h-9", t.done && "text-muted-foreground line-through")}
            />
          </div>
        );
      })}
    </div>
  );
}

type Draft = { text: string; done: boolean };

const slots = (day: DayView): Draft[] =>
  Array.from({ length: MAX_DAY_TASKS }, (_, i) => ({ text: day.tasks[i]?.text ?? "", done: day.tasks[i]?.done ?? false }));

/** What gets saved: filled slots only, trimmed, in order. */
const clean = (drafts: Draft[]) => drafts.filter((t) => t.text.trim()).map((t) => ({ text: t.text.trim(), done: t.done }));

export function HabitChecklist({ title, habits, date }: { title?: string; habits: DayHabit[]; date: string }) {
  const toggle = useToggleCheck();
  return (
    <div className="grid gap-1.5">
      {title && <p className="text-xs text-muted-foreground">{title}</p>}
      <ul className="grid gap-1.5">
        {habits.map((h) => (
          <li key={h.id} className="grid gap-0.5 text-sm">
            <div className="flex items-center gap-2">
              <TickBox
                checked={h.checked}
                label={`${h.name}: ${h.checked ? "untick" : "tick"}`}
                onChange={(checked) => toggle.mutate({ habitId: h.id, frequency: h.frequency, date, checked })}
              />
              <span className={cn("min-w-0 flex-1 truncate", h.checked && "text-muted-foreground")}>
                {h.name}
                {h.total !== null && <span className="ml-1.5 text-xs text-muted-foreground">· {h.total} done</span>}
              </span>
              {h.streak > 1 && (
                <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground" title={`${h.streak} in a row`}>
                  <Fire weight="fill" className="text-primary" />
                  {h.streak}
                </span>
              )}
            </div>
            {h.atRisk && (
              <p className="flex items-center gap-1.5 pl-7 text-xs text-status-warning">
                <WarningCircle weight="fill" aria-hidden />
                Missed {h.frequency === "weekly" ? "last week" : "yesterday"} · tick {h.frequency === "weekly" ? "this week" : "today"} to keep{" "}
                {h.streak}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TickBox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40",
        checked ? "bg-primary text-primary-foreground" : "shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent",
        className,
      )}
    >
      {checked && <Check weight="bold" className="size-3.5" />}
    </button>
  );
}
