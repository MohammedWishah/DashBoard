import { useState, type FormEvent } from "react";
import { Plus } from "@phosphor-icons/react";
import { berlinToday, formatEuro, parseEuroToCents } from "@shared/money";
import type { DebtSummary, GoalSummary } from "@shared/money-schemas";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddContribution, useAddPayment, useMoneyAction } from "@/hooks/money";
import { moneyApi } from "@/lib/money-api";
import { cn } from "@/lib/utils";
import { panel } from "./summary";

type DialogState =
  | { kind: "contribute"; goal: GoalSummary }
  | { kind: "pay"; debt: DebtSummary }
  | { kind: "new-goal" }
  | { kind: "new-debt" }
  | null;

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-foreground/75" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function GoalsAndDebts({ goals, debts }: { goals: GoalSummary[]; debts: DebtSummary[] }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = () => setDialog(null);

  return (
    <section className={cn(panel, "grid content-start gap-6 p-5")}>
      <div className="grid gap-3">
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
          <ul className="grid gap-4">
            {goals.map((g) => (
              <li key={g.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{g.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="text-foreground">{formatEuro(g.savedCents)}</span> of {formatEuro(g.targetCents)}
                  </span>
                </div>
                <Meter value={g.savedCents} max={g.targetCents} label={`${g.name} saved`} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {g.savedCents >= g.targetCents ? "Goal reached" : `${formatEuro(g.targetCents - g.savedCents)} to go`}
                    {g.targetDate && `, by ${g.targetDate}`}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "contribute", goal: g })}>
                    Add money
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 border-t border-border/70 pt-5">
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
          <ul className="grid gap-4">
            {debts.map((d) => (
              <li key={d.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="text-foreground">{formatEuro(d.balanceCents)}</span> left of {formatEuro(d.startingBalanceCents)}
                  </span>
                </div>
                <Meter value={d.paidCents} max={d.startingBalanceCents} label={`${d.name} paid off`} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{d.balanceCents === 0 ? "Paid off" : `${formatEuro(d.paidCents)} paid so far`}</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDialog({ kind: "pay", debt: d })}>
                    Log payment
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-md">
          {dialog?.kind === "contribute" && <ContributeForm goal={dialog.goal} onClose={close} />}
          {dialog?.kind === "pay" && <PaymentForm debt={dialog.debt} onClose={close} />}
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
}: {
  amount: string;
  setAmount: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  amountLabel?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-2">
        <Label htmlFor="gd-amount">{amountLabel}</Label>
        <Input id="gd-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="gd-date">Date</Label>
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

function ContributeForm({ goal, onClose }: { goal: GoalSummary; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [direction, setDirection] = useState<"add" | "take">("add");
  const [error, setError] = useState<string | null>(null);
  const add = useAddContribution();
  const archive = useMoneyAction(() => moneyApi.archiveGoal(goal.id), "Goal archived");

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 50");
    add.mutate({ goalId: goal.id, input: { amountCents: direction === "add" ? cents : -cents, onDate: date } });
    onClose();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{goal.name}</DialogTitle>
        <DialogDescription>
          {formatEuro(goal.savedCents)} of {formatEuro(goal.targetCents)} saved.
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            archive.mutate(undefined);
            onClose();
          }}
        >
          Archive goal
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

function PaymentForm({ debt, onClose }: { debt: DebtSummary; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(berlinToday());
  const [error, setError] = useState<string | null>(null);
  const pay = useAddPayment();
  const archive = useMoneyAction(() => moneyApi.archiveDebt(debt.id), "Debt archived");

  function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseEuroToCents(amount);
    if (cents === null) return setError("Enter an amount like 100");
    pay.mutate({ debtId: debt.id, input: { amountCents: cents, paidOn: date } });
    onClose();
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            archive.mutate(undefined);
            onClose();
          }}
        >
          Archive debt
        </Button>
        <Button type="submit">Log payment</Button>
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
