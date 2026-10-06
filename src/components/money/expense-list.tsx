import { useState, type FormEvent } from "react";
import { ArrowsClockwise, CaretRight, MagnifyingGlass, X } from "@phosphor-icons/react";
import { format, parseISO, subDays } from "date-fns";
import { formatEuro, parseEuroToCents } from "@shared/money";
import type { ExpenseItem, IncomeRow } from "@shared/money-schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories, useDeleteWithUndo, useMonthExpenses, useUpdateExpense, useUpdateIncome } from "@/hooks/money";
import { cn } from "@/lib/utils";
import { monthName, panel, shortDate } from "./summary";

export type CategoryFilter = { id: string; name: string };

type DayGroup = { day: string; totalCents: number; items: ExpenseItem[] };

function groupByDay(rows: ExpenseItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of rows) {
    const last = groups.at(-1);
    if (last?.day === e.spentOn) {
      last.items.push(e);
      last.totalCents += e.amountCents;
    } else groups.push({ day: e.spentOn, totalCents: e.amountCents, items: [e] });
  }
  return groups;
}

function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === format(subDays(parseISO(today), 1), "yyyy-MM-dd")) return "Yesterday";
  return format(parseISO(day), "EEE d MMM");
}

const matches = (e: ExpenseItem, q: string) => (e.note ?? "").toLowerCase().includes(q) || e.categoryName.toLowerCase().includes(q);

export function ExpenseList({
  month,
  today,
  recent,
  total,
  income,
  filter,
  onClearFilter,
  onAdd,
}: {
  month: string;
  today: string;
  recent: ExpenseItem[];
  total: number;
  income: IncomeRow[];
  filter: CategoryFilter | null;
  onClearFilter: () => void;
  onAdd: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const narrowed = filter !== null || q !== "";
  const full = showAll || narrowed;
  const all = useMonthExpenses(month, full);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [editingIncome, setEditingIncome] = useState<IncomeRow | null>(null);
  // Until the whole month arrives, narrow what's already on screen.
  const source = full ? (all.data ?? recent) : recent;
  const rows = source.filter((e) => (!filter || e.categoryId === filter.id) && (!q || matches(e, q)));
  const loadingMore = full && !all.data;
  const shownCents = rows.reduce((a, e) => a + e.amountCents, 0);

  function closeSearch() {
    setQuery("");
    setSearching(false);
  }

  return (
    <section className={cn(panel, "grid content-start gap-3 p-5")} aria-labelledby="expenses-title">
      <header className="flex items-center justify-between gap-2">
        <h2 id="expenses-title" className="text-sm font-semibold">
          {filter ? `${filter.name} expenses` : showAll ? "All expenses" : "Recent expenses"}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => (searching ? closeSearch() : setSearching(true))}
            aria-label={searching ? "Close search" : "Search expenses"}
            aria-pressed={searching}
          >
            {searching ? <X /> : <MagnifyingGlass />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onAdd} className="hidden md:inline-flex">
            Add
          </Button>
        </div>
      </header>

      {searching && (
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && closeSearch()}
          placeholder={`Search ${monthName(month)}`}
          aria-label="Search notes and categories"
          className="h-9"
        />
      )}

      {narrowed && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {filter && (
            <button
              type="button"
              onClick={onClearFilter}
              className="flex h-7 items-center gap-1 rounded-full bg-secondary pr-2 pl-3 text-xs font-medium text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent"
              aria-label={`Show all categories, not just ${filter.name}`}
            >
              {filter.name}
              <X className="size-3" />
            </button>
          )}
          {!loadingMore && (
            <span aria-live="polite">
              {formatEuro(shownCents)} across {rows.length} {rows.length === 1 ? "expense" : "expenses"}
            </span>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {loadingMore
            ? "Loading the whole month"
            : narrowed
              ? "Nothing matches in this month."
              : "Nothing logged this month. Use Add to log your first expense."}
        </p>
      ) : (
        <div className="-mx-2 grid gap-3">
          {groupByDay(rows).map((g) => (
            <div key={g.day} className="grid">
              <div className="flex items-baseline justify-between px-2 pb-1 text-xs text-muted-foreground">
                <span className="font-medium">{dayLabel(g.day, today)}</span>
                {g.items.length > 1 && <span className="tabular-nums">{formatEuro(g.totalCents)}</span>}
              </div>
              <ul className="grid">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={e.id.startsWith("temp-")}
                      onClick={() => setEditing(e)}
                      className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none disabled:opacity-60"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{e.note || e.categoryName}</span>
                        {(e.note || e.recurringBillId) && (
                          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                            {e.recurringBillId && <ArrowsClockwise className="size-3" aria-hidden />}
                            {e.recurringBillId ? `Recurring, ${e.categoryName}` : e.categoryName}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">{formatEuro(e.amountCents)}</span>
                      <CaretRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!narrowed && total > recent.length && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll((v) => !v)} disabled={all.isFetching}>
          {showAll ? "Show recent only" : `Show all ${total}`}
        </Button>
      )}

      {!narrowed && income.length > 0 && (
        <div className="mt-2 grid gap-1 border-t border-border/70 pt-4">
          <h3 className="pb-1 text-xs font-medium text-muted-foreground">Income</h3>
          <ul className="-mx-2 grid">
            {income.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setEditingIncome(i)}
                  className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(i.receivedOn)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{i.source}</span>
                  <span className="tabular-nums">{formatEuro(i.amountCents)}</span>
                  <CaretRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditExpenseDialog expense={editing} month={month} onClose={() => setEditing(null)} />
      <EditIncomeDialog income={editingIncome} onClose={() => setEditingIncome(null)} />
    </section>
  );
}

function EditExpenseDialog({ expense, month, onClose }: { expense: ExpenseItem | null; month: string; onClose: () => void }) {
  return (
    <Dialog open={expense !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {expense && <EditExpenseForm key={expense.id} expense={expense} month={month} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseForm({ expense, month, onClose }: { expense: ExpenseItem; month: string; onClose: () => void }) {
  const categories = useCategories();
  const [amount, setAmount] = useState((expense.amountCents / 100).toFixed(2));
  const [categoryId, setCategoryId] = useState(expense.categoryId);
  const [date, setDate] = useState(expense.spentOn);
  const [note, setNote] = useState(expense.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateExpense();
  const remove = useDeleteWithUndo();

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 12.50");
    update.mutate(
      { id: expense.id, month, patch: { amountCents: cents, categoryId, spentOn: date, note: note.trim() || null } },
      { onSuccess: onClose, onError: (err) => setError(err.message) },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Edit expense</DialogTitle>
        <DialogDescription>
          {expense.recurringBillId ? "Logged by a recurring bill. Deleting it skips this month only." : "Change or delete this expense."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ee-amount">Amount (€)</Label>
          <Input id="ee-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ee-date">Date</Label>
          <Input id="ee-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ee-cat">Category</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="ee-cat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(categories.data ?? [])
              .filter((c) => !c.archived || c.id === categoryId)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ee-note">Note</Label>
        <Input id="ee-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            remove({ kind: "expense", item: expense });
            onClose();
          }}
        >
          Delete
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function EditIncomeDialog({ income, onClose }: { income: IncomeRow | null; onClose: () => void }) {
  return (
    <Dialog open={income !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">{income && <EditIncomeForm key={income.id} income={income} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditIncomeForm({ income, onClose }: { income: IncomeRow; onClose: () => void }) {
  const [amount, setAmount] = useState((income.amountCents / 100).toFixed(2));
  const [source, setSource] = useState(income.source);
  const [date, setDate] = useState(income.receivedOn);
  const [note, setNote] = useState(income.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateIncome();
  const remove = useDeleteWithUndo();

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 1200");
    if (!source.trim()) return setError("Add where the money came from");
    update.mutate(
      { id: income.id, patch: { amountCents: cents, source: source.trim(), receivedOn: date, note: note.trim() || null } },
      { onSuccess: onClose, onError: (err) => setError(err.message) },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Edit income</DialogTitle>
        <DialogDescription>Change or delete this income.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ei-amount">Amount (€)</Label>
          <Input id="ei-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ei-date">Date</Label>
          <Input id="ei-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ei-source">From</Label>
        <Input id="ei-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ei-note">Note</Label>
        <Input id="ei-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            remove({ kind: "income", item: income });
            onClose();
          }}
        >
          Delete
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            Save
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
