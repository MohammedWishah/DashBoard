import { useState, type FormEvent } from "react";
import { ArrowsClockwise, CaretRight, Trash } from "@phosphor-icons/react";
import { formatEuro, parseEuroToCents } from "@shared/money";
import type { ExpenseItem, IncomeRow } from "@shared/money-schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories, useDeleteExpense, useDeleteIncome, useMonthExpenses, useUpdateExpense } from "@/hooks/money";
import { cn } from "@/lib/utils";
import { panel, shortDate } from "./summary";

export function ExpenseList({
  month,
  recent,
  total,
  income,
  onAdd,
}: {
  month: string;
  recent: ExpenseItem[];
  total: number;
  income: IncomeRow[];
  onAdd: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const all = useMonthExpenses(month, showAll);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const deleteIncome = useDeleteIncome();
  const rows = showAll && all.data ? all.data : recent;

  return (
    <section className={cn(panel, "grid content-start gap-3 p-5")}>
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{showAll ? "All expenses" : "Recent expenses"}</h2>
        <Button variant="ghost" size="sm" onClick={onAdd} className="hidden md:inline-flex">
          Add
        </Button>
      </header>

      {rows.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing logged this month. Use Add to log your first expense.</p>
      ) : (
        <ul className="-mx-2 grid">
          {rows.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                disabled={e.id.startsWith("temp-")}
                onClick={() => setEditing(e)}
                className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none disabled:opacity-60"
              >
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(e.spentOn)}</span>
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
      )}

      {total > recent.length && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll((v) => !v)} disabled={all.isFetching}>
          {showAll ? "Show recent only" : `Show all ${total}`}
        </Button>
      )}

      {income.length > 0 && (
        <div className="mt-2 grid gap-2 border-t border-border/70 pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">Income</h3>
          <ul className="grid gap-1">
            {income.map((i) => (
              <li key={i.id} className="group flex items-center gap-3 px-0 py-1 text-sm">
                <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(i.receivedOn)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{i.source}</span>
                <span className="tabular-nums">{formatEuro(i.amountCents)}</span>
                <button
                  type="button"
                  onClick={() => deleteIncome.mutate(i.id)}
                  aria-label={`Delete income ${i.source}`}
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <EditExpenseDialog expense={editing} month={month} onClose={() => setEditing(null)} />
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
  const remove = useDeleteExpense();

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
            remove.mutate({ expense });
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
