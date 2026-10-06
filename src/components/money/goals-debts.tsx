import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CaretRight, Plus, X } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { berlinToday, formatEuro, goalMonthlyNeed, parseEuroToCents } from "@shared/money";
import type { ContributionRow, DebtSummary, GoalSummary, PaymentRow } from "@shared/money-schemas";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddContribution, useAddPayment, useDebtHistory, useGoalHistory, useMoneyAction, useMoneyUndo } from "@/hooks/money";
import { moneyApi } from "@/lib/money-api";
import { cn } from "@/lib/utils";
import { panel, shortDate } from "./summary";

type DialogState =
  | { kind: "goal"; goal: GoalSummary }
  | { kind: "debt"; debt: DebtSummary }
  | { kind: "new-goal" }
  | { kind: "new-debt" }
  | null;

const longDate = (d: string) => format(parseISO(d), "d MMM yyyy");

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span
      className="block h-1.5 overflow-hidden rounded-full bg-foreground/10"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <span className="block h-full rounded-full bg-foreground/75" style={{ width: `${pct}%` }} />
    </span>
  );
}

const rowButton =
  "group grid w-full gap-1.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none";

export function GoalsAndDebts({ goals, debts }: { goals: GoalSummary[]; debts: DebtSummary[] }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);
  const today = berlinToday();
  // Keep the open dialog in step with fresh data after a contribution or payment.
  const openGoal = dialog?.kind === "goal" ? (goals.find((g) => g.id === dialog.goal.id) ?? dialog.goal) : null;
  const openDebt = dialog?.kind === "debt" ? (debts.find((d) => d.id === dialog.debt.id) ?? dialog.debt) : null;

  return (
    <section className={cn(panel, "grid content-start gap-6 p-5")}>
      <div className="grid gap-2">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Savings goals</h2>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "new-goal" })}>
            <Plus />
            Goal
          </Button>
        </header>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Save toward something specific, like a holiday or a new laptop.</p>
        ) : (
          <ul className="-mx-2 grid gap-1">
            {goals.map((g) => {
              const need = goalMonthlyNeed(g, today);
              const reached = g.savedCents >= g.targetCents;
              return (
                <li key={g.id}>
                  <button type="button" className={rowButton} onClick={() => setDialog({ kind: "goal", goal: g })}>
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{g.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        <span className="text-foreground">{formatEuro(g.savedCents)}</span> of {formatEuro(g.targetCents)}
                      </span>
                    </span>
                    <Meter value={g.savedCents} max={g.targetCents} label={`${g.name} saved`} />
                    <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>
                        {reached ? (
                          <span className="text-primary">Goal reached</span>
                        ) : (
                          `${formatEuro(g.targetCents - g.savedCents)} to go`
                        )}
                        {g.targetDate && !reached && `, by ${longDate(g.targetDate)}`}
                        {need !== null && (
                          <>
                            <br />
                            {formatEuro(need)} a month gets you there
                          </>
                        )}
                        {g.targetDate && !reached && g.targetDate < today && (
                          <>
                            <br />
                            The date has passed. Edit it or keep going.
                          </>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 group-hover:text-foreground">
                        Add money
                        <CaretRight className="size-3" />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="grid gap-2 border-t border-border/70 pt-5">
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Debts</h2>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "new-debt" })}>
            <Plus />
            Debt
          </Button>
        </header>
        {debts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Track a loan or what you owe someone, and watch it go down.</p>
        ) : (
          <ul className="-mx-2 grid gap-1">
            {debts.map((d) => (
              <li key={d.id}>
                <button type="button" className={rowButton} onClick={() => setDialog({ kind: "debt", debt: d })}>
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{d.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      <span className="text-foreground">{formatEuro(d.balanceCents)}</span> left of {formatEuro(d.startingBalanceCents)}
                    </span>
                  </span>
                  <Meter value={d.paidCents} max={d.startingBalanceCents} label={`${d.name} paid off`} />
                  <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{d.balanceCents === 0 ? <span className="text-primary">Paid off</span> : `${formatEuro(d.paidCents)} paid so far`}</span>
                    <span className="flex shrink-0 items-center gap-0.5 group-hover:text-foreground">
                      Log payment
                      <CaretRight className="size-3" />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          {openGoal && <GoalDialog key={openGoal.id} goal={openGoal} onClose={close} />}
          {openDebt && <DebtDialog key={openDebt.id} debt={openDebt} onClose={close} />}
          {dialog?.kind === "new-goal" && <NewGoalForm onClose={close} />}
          {dialog?.kind === "new-debt" && <NewDebtForm onClose={close} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AmountDateFields({
  amount,
  setAmount,
  date,
  setDate,
  amountLabel = "Amount (€)",
  dateLabel = "Date",
}: {
  amount: string;
  setAmount: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  amountLabel?: string;
  dateLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label htmlFor="gd-amount">{amountLabel}</Label>
        <Input id="gd-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gd-date">{dateLabel}</Label>
        <Input id="gd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
      </div>
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

/** Past entries, newest first. Removing one shows a toast with Undo, which adds it back. */
function History({
  rows,
  loading,
  signed,
  onRemove,
}: {
  rows: { id: string; amountCents: number; date: string; note: string | null }[];
  loading: boolean;
  signed?: boolean;
  onRemove: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (loading) return <p className="text-xs text-muted-foreground">Loading history</p>;
  if (rows.length === 0) return null;
  const shown = showAll ? rows : rows.slice(0, 5);
  return (
    <div className="grid gap-1 border-t border-border/70 pt-4">
      <h3 className="pb-1 text-xs font-medium text-muted-foreground">History</h3>
      <ul className="grid">
        {shown.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-1 text-sm">
            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(r.date)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.note}</span>
            <span className="tabular-nums">
              {signed && (r.amountCents < 0 ? "−" : "+")}
              {formatEuro(Math.abs(r.amountCents))}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(r.id)}
              aria-label={`Remove ${formatEuro(Math.abs(r.amountCents))} on ${shortDate(r.date)}`}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      {rows.length > 5 && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      )}
    </div>
  );
}

// ---- Goals ------------------------------------------------------------------

function GoalDialog({ goal, onClose }: { goal: GoalSummary; onClose: () => void }) {
  const [mode, setMode] = useState<"money" | "edit">("money");
  return mode === "money" ? (
    <ContributeForm goal={goal} onClose={onClose} onEdit={() => setMode("edit")} />
  ) : (
    <EditGoalForm goal={goal} onClose={onClose} onBack={() => setMode("money")} />
  );
}

function ContributeForm({ goal, onClose, onEdit }: { goal: GoalSummary; onClose: () => void; onEdit: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [direction, setDirection] = useState<"add" | "take">("add");
  const [error, setError] = useState<string | null>(null);
  const add = useAddContribution();
  const history = useGoalHistory(goal.id);
  const undo = useMoneyUndo();
  const remove = useMoneyAction(async (entry: ContributionRow) => {
    await moneyApi.deleteContribution(entry.id);
    toast(`Removed ${formatEuro(Math.abs(entry.amountCents))} from ${goal.name}`, {
      action: {
        label: "Undo",
        onClick: () => undo(() => moneyApi.addContribution(goal.id, { amountCents: entry.amountCents, onDate: entry.onDate, note: entry.note })),
      },
    });
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 50");
    add.mutate({ goalId: goal.id, input: { amountCents: direction === "add" ? cents : -cents, onDate: date } });
    onClose();
  }

  function removeEntry(id: string) {
    const entry = history.data?.find((c) => c.id === id);
    if (entry) remove.mutate(entry);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{goal.name}</DialogTitle>
        <DialogDescription>
          {formatEuro(goal.savedCents)} of {formatEuro(goal.targetCents)} saved
          {goal.targetDate && `, by ${longDate(goal.targetDate)}`}.
        </DialogDescription>
      </DialogHeader>
      <Segmented<"add" | "take">
        name="contribution-direction"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "add", label: "Add money" },
          { value: "take", label: "Take out" },
        ]}
      />
      <AmountDateFields amount={amount} setAmount={setAmount} date={date} setDate={setDate} />
      <FormError error={error} />
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onEdit}>
          Edit goal
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
      <History
        signed
        loading={history.isPending}
        rows={(history.data ?? []).map((c) => ({ id: c.id, amountCents: c.amountCents, date: c.onDate, note: c.note }))}
        onRemove={removeEntry}
      />
    </form>
  );
}

function EditGoalForm({ goal, onClose, onBack }: { goal: GoalSummary; onClose: () => void; onBack: () => void }) {
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState((goal.targetCents / 100).toFixed(2));
  const [date, setDate] = useState(goal.targetDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMoneyAction(
    (patch: { name: string; targetCents: number; targetDate: string | null }) => moneyApi.updateGoal(goal.id, patch),
    "Goal updated",
  );
  const undo = useMoneyUndo();
  const archiveIt = useMoneyAction(async () => {
    await moneyApi.updateGoal(goal.id, { archived: true });
    toast(`Archived ${goal.name}`, {
      action: { label: "Undo", onClick: () => undo(() => moneyApi.updateGoal(goal.id, { archived: false })) },
    });
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(target);
    if (!name.trim()) return setError("Give the goal a name");
    if (cents === null) return setError("Enter a target like 800");
    save.mutate({ name: name.trim(), targetCents: cents, targetDate: date || null }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  }

  function archive() {
    archiveIt.mutate(undefined);
    onClose();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Edit goal</DialogTitle>
        <DialogDescription>Money already saved stays with the goal.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="eg-name">Name</Label>
        <Input id="eg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="eg-target">Target (€)</Label>
          <Input id="eg-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="eg-date">By (optional)</Label>
          <Input id="eg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </div>
      </div>
      <FormError error={error} />
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={archive}
          disabled={archiveIt.isPending}
        >
          Archive goal
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save changes
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function NewGoalForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMoneyAction(
    (v: { name: string; targetCents: number; targetDate: string | null }) => moneyApi.createGoal(v),
    "Goal added",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(target);
    if (!name.trim()) return setError("Give the goal a name");
    if (cents === null) return setError("Enter a target like 800");
    create.mutate({ name: name.trim(), targetCents: cents, targetDate: date || null }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>New savings goal</DialogTitle>
        <DialogDescription>What are you saving for?</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="ng-name">Name</Label>
        <Input id="ng-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="ng-target">Target (€)</Label>
          <Input id="ng-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ng-date">By (optional)</Label>
          <Input id="ng-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </div>
      </div>
      <FormError error={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Add goal
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---- Debts ------------------------------------------------------------------

function DebtDialog({ debt, onClose }: { debt: DebtSummary; onClose: () => void }) {
  const [mode, setMode] = useState<"pay" | "edit">("pay");
  return mode === "pay" ? (
    <PaymentForm debt={debt} onClose={onClose} onEdit={() => setMode("edit")} />
  ) : (
    <EditDebtForm debt={debt} onClose={onClose} onBack={() => setMode("pay")} />
  );
}

function PaymentForm({ debt, onClose, onEdit }: { debt: DebtSummary; onClose: () => void; onEdit: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [error, setError] = useState<string | null>(null);
  const pay = useAddPayment();
  const history = useDebtHistory(debt.id);
  const undo = useMoneyUndo();
  const remove = useMoneyAction(async (entry: PaymentRow) => {
    await moneyApi.deletePayment(entry.id);
    toast(`Removed the ${formatEuro(entry.amountCents)} payment`, {
      action: {
        label: "Undo",
        onClick: () => undo(() => moneyApi.addPayment(debt.id, { amountCents: entry.amountCents, paidOn: entry.paidOn, note: entry.note })),
      },
    });
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 100");
    pay.mutate({ debtId: debt.id, input: { amountCents: cents, paidOn: date } });
    onClose();
  }

  function removeEntry(id: string) {
    const entry = history.data?.find((p) => p.id === id);
    if (entry) remove.mutate(entry);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Pay {debt.name}</DialogTitle>
        <DialogDescription>{formatEuro(debt.balanceCents)} left to pay.</DialogDescription>
      </DialogHeader>
      <AmountDateFields amount={amount} setAmount={setAmount} date={date} setDate={setDate} amountLabel="Payment (€)" />
      <FormError error={error} />
      <DialogFooter className="sm:justify-between">
        <Button type="button" variant="ghost" onClick={onEdit}>
          Edit debt
        </Button>
        <Button type="submit">Log payment</Button>
      </DialogFooter>
      <History
        loading={history.isPending}
        rows={(history.data ?? []).map((p) => ({ id: p.id, amountCents: p.amountCents, date: p.paidOn, note: p.note }))}
        onRemove={removeEntry}
      />
    </form>
  );
}

function EditDebtForm({ debt, onClose, onBack }: { debt: DebtSummary; onClose: () => void; onBack: () => void }) {
  const [name, setName] = useState(debt.name);
  const [balance, setBalance] = useState((debt.startingBalanceCents / 100).toFixed(2));
  const [date, setDate] = useState(debt.startedOn);
  const [error, setError] = useState<string | null>(null);
  const save = useMoneyAction(
    (patch: { name: string; startingBalanceCents: number; startedOn: string }) => moneyApi.updateDebt(debt.id, patch),
    "Debt updated",
  );
  const undo = useMoneyUndo();
  const archiveIt = useMoneyAction(async () => {
    await moneyApi.updateDebt(debt.id, { archived: true });
    toast(`Archived ${debt.name}`, {
      action: { label: "Undo", onClick: () => undo(() => moneyApi.updateDebt(debt.id, { archived: false })) },
    });
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(balance);
    if (!name.trim()) return setError("Give the debt a name");
    if (cents === null) return setError("Enter what you owed at the start, like 1200");
    if (!date) return setError("Pick the start date");
    save.mutate({ name: name.trim(), startingBalanceCents: cents, startedOn: date }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  }

  function archive() {
    archiveIt.mutate(undefined);
    onClose();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Edit debt</DialogTitle>
        <DialogDescription>Payments you logged stay with the debt.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="ed-name">Name</Label>
        <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </div>
      <AmountDateFields amount={balance} setAmount={setBalance} date={date} setDate={setDate} amountLabel="Owed at start (€)" dateLabel="Started" />
      <FormError error={error} />
      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={archive}
          disabled={archiveIt.isPending}
        >
          Archive debt
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save changes
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

function NewDebtForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [error, setError] = useState<string | null>(null);
  const create = useMoneyAction(
    (v: { name: string; startingBalanceCents: number; startedOn: string }) => moneyApi.createDebt(v),
    "Debt added",
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(balance);
    if (!name.trim()) return setError("Give the debt a name");
    if (cents === null) return setError("Enter what you owe, like 1200");
    create.mutate({ name: name.trim(), startingBalanceCents: cents, startedOn: date }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>New debt</DialogTitle>
        <DialogDescription>What you owe right now. Log payments to bring it down.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="nd-name">Name</Label>
        <Input id="nd-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </div>
      <AmountDateFields amount={balance} setAmount={setBalance} date={date} setDate={setDate} amountLabel="Owed (€)" />
      <FormError error={error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Add debt
        </Button>
      </DialogFooter>
    </form>
  );
}
