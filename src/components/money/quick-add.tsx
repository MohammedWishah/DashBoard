import { useRef, useState, type FormEvent } from "react";
import { berlinToday, formatEuro, matchNotes, parseEuroToCents, type QuickPick } from "@shared/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/segmented";
import { useAddExpense, useAddIncome, useCategories, useSuggestions } from "@/hooks/money";
import { cn } from "@/lib/utils";

type Tab = "expense" | "income";

const LAST_CATEGORY_KEY = "quick-add:last-category";

function readLastCategory(): string | null {
  try {
    return localStorage.getItem(LAST_CATEGORY_KEY);
  } catch {
    return null;
  }
}

export const sheetClass =
  "max-md:top-auto max-md:bottom-0 max-md:w-full max-md:max-w-none max-md:translate-y-0 max-md:rounded-b-none max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]";

export function QuickAdd({
  tab,
  onTabChange,
  onClose,
}: {
  tab: Tab | null;
  onTabChange: (t: Tab) => void;
  onClose: () => void;
}) {
  const amountRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={tab !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn("max-w-md", sheetClass)}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          amountRef.current?.focus();
        }}
      >
        {tab && <QuickAddForm tab={tab} onTabChange={onTabChange} onDone={onClose} amountRef={amountRef} />}
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({
  tab,
  onTabChange,
  onDone,
  amountRef,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onDone: () => void;
  amountRef: React.RefObject<HTMLInputElement | null>;
}) {
  const categories = useCategories();
  const suggestions = useSuggestions();
  const visible = (categories.data ?? []).filter((c) => !c.archived);
  const visibleNames = new Map(visible.map((c) => [c.id, c.name]));
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(readLastCategory);
  const [date, setDate] = useState(berlinToday());
  const [note, setNote] = useState("");
  const [source, setSource] = useState("Salary");
  const [error, setError] = useState<string | null>(null);
  const addExpense = useAddExpense();
  const addIncome = useAddIncome();
  const selected = visible.find((c) => c.id === categoryId) ?? null;
  const picks = tab === "expense" ? (suggestions.data?.quickPicks ?? []).filter((p) => visibleNames.has(p.categoryId)) : [];
  const noteHits =
    tab === "expense" ? matchNotes(suggestions.data?.notes ?? [], note).filter((n) => visibleNames.has(n.categoryId)) : [];

  function remember(id: string) {
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, id);
    } catch {
      /* storage unavailable; the default just won't stick */
    }
  }

  /** One tap logs a usual expense on the chosen date. The toast offers Undo. */
  function logPick(p: QuickPick) {
    const name = visibleNames.get(p.categoryId)!;
    remember(p.categoryId);
    addExpense.mutate({ categoryId: p.categoryId, categoryName: name, amountCents: p.amountCents, spentOn: date || berlinToday(), note: p.note });
    onDone();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 12.50");
    if (!date) return setError("Pick a date");

    if (tab === "expense") {
      if (!selected) return setError("Pick a category");
      remember(selected.id);
      addExpense.mutate({ categoryId: selected.id, categoryName: selected.name, amountCents: cents, spentOn: date, note: note.trim() || null });
    } else {
      if (!source.trim()) return setError("Add where the money came from");
      addIncome.mutate({ amountCents: cents, source: source.trim(), receivedOn: date, note: note.trim() || null });
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{tab === "expense" ? "Add expense" : "Add income"}</DialogTitle>
        <DialogDescription className="sr-only">Amount, {tab === "expense" ? "category" : "source"}, and date.</DialogDescription>
      </DialogHeader>

      <Segmented<Tab>
        name="quick-add-tab"
        value={tab}
        onChange={onTabChange}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />

      {picks.length > 0 && (
        <div className="grid gap-2">
          <p className="text-[13px] font-medium" id="qa-usual">
            Usual <span className="font-normal text-muted-foreground">· one tap adds it</span>
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="qa-usual">
            {picks.map((p) => (
              <button
                key={`${p.categoryId}-${p.note}-${p.amountCents}`}
                type="button"
                onClick={() => logPick(p)}
                className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {p.note ?? p.categoryName}
                <span className="tabular-nums text-muted-foreground">{formatEuro(p.amountCents)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="qa-amount">Amount</Label>
        <div className="flex items-baseline gap-2 rounded-lg border border-input bg-background/60 px-4 py-2 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <span className="text-2xl text-muted-foreground">€</span>
          <input
            ref={amountRef}
            id="qa-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            className="w-full bg-transparent text-4xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {tab === "expense" ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[13px] font-medium">Category</legend>
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  setError(null);
                }}
                aria-pressed={c.id === categoryId}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  c.id === categoryId
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent",
                )}
              >
                {c.name}
              </button>
            ))}
            {categories.isPending && <span className="text-sm text-muted-foreground">Loading categories</span>}
          </div>
        </fieldset>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="qa-source">From</Label>
          <Input id="qa-source" value={source} onChange={(e) => setSource(e.target.value)} maxLength={80} />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-3">
        <div className="grid gap-2">
          <Label htmlFor="qa-date">Date</Label>
          <Input id="qa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="qa-note">Note</Label>
          <Input
            id="qa-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Optional"
            autoComplete="off"
          />
        </div>
      </div>

      {noteHits.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-2" aria-label="Past notes">
          {noteHits.map((n) => (
            <button
              key={n.note}
              type="button"
              onClick={() => {
                setNote(n.note);
                setCategoryId(n.categoryId);
                setError(null);
              }}
              className="h-8 rounded-full px-3 text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="text-foreground">{n.note}</span> · {visibleNames.get(n.categoryId)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full">
        {tab === "expense" ? "Add expense" : "Add income"}
      </Button>
    </form>
  );
}
