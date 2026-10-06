import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { berlinToday, formatEuro, parseEuroToCents } from "@shared/money";
import type { BillRow, CategoryRow } from "@shared/money-schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBills, useCategories, useMoneyAction, useMoneyUndo } from "@/hooks/money";
import { ApiError } from "@/lib/api";
import { moneyApi } from "@/lib/money-api";

export type ManageTab = "categories" | "bills";

export function ManageDialog({ tab, onClose }: { tab: ManageTab | null; onClose: () => void }) {
  return (
    <Dialog open={tab !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage money</DialogTitle>
          <DialogDescription>Categories with their monthly limits, and bills that log themselves.</DialogDescription>
        </DialogHeader>
        {tab && (
          <Tabs defaultValue={tab} className="gap-5">
            <TabsList>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="bills">Recurring bills</TabsTrigger>
            </TabsList>
            <TabsContent value="categories">
              <CategoriesTab />
            </TabsContent>
            <TabsContent value="bills">
              <BillsTab />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Categories -----------------------------------------------------------

function CategoriesTab() {
  const categories = useCategories();
  const [name, setName] = useState("");
  const create = useMoneyAction((n: string) => moneyApi.createCategory({ name: n }), "Category added");
  const rows = categories.data ?? [];
  const active = rows.filter((c) => !c.archived);
  const archived = rows.filter((c) => c.archived);

  function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(name.trim(), { onSuccess: () => setName("") });
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {active.map((c, i) => (
          <CategoryEditor key={c.id} category={c} above={active[i - 1]} below={active[i + 1]} />
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={80} aria-label="New category name" />
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
          Add
        </Button>
      </form>
      {archived.length > 0 && (
        <div className="grid gap-2 border-t border-border/70 pt-4">
          <p className="text-xs text-muted-foreground">Archived</p>
          {archived.map((c) => (
            <ArchivedCategory key={c.id} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryEditor({ category, above, below }: { category: CategoryRow; above?: CategoryRow; below?: CategoryRow }) {
  const [name, setName] = useState(category.name);
  const [limit, setLimit] = useState(category.monthlyLimitCents === null ? "" : String(category.monthlyLimitCents / 100));
  const [error, setError] = useState<string | null>(null);
  const update = useMoneyAction((patch: Parameters<typeof moneyApi.updateCategory>[1]) => moneyApi.updateCategory(category.id, patch));
  const swap = useMoneyAction(async (other: CategoryRow) => {
    await moneyApi.updateCategory(category.id, { sortOrder: other.sortOrder });
    await moneyApi.updateCategory(other.id, { sortOrder: category.sortOrder });
  });
  const remove = useMoneyAction(async () => {
    try {
      await moneyApi.deleteCategory(category.id);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "category_in_use")) throw err;
      // In use: archive instead so history keeps its category.
      await moneyApi.updateCategory(category.id, { archived: true });
    }
  }, `${category.name} removed`);

  function saveName() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setName(category.name);
      return setError("A category needs a name");
    }
    if (trimmed === category.name) return;
    update.mutate(
      { name: trimmed },
      {
        onError: (err) => {
          setName(category.name);
          setError(err.message);
        },
      },
    );
  }

  function saveLimit() {
    setError(null);
    const trimmed = limit.trim();
    const cents = trimmed === "" ? null : parseEuroToCents(trimmed);
    if (trimmed !== "" && cents === null) return setError("Enter an amount or leave empty");
    if (cents !== category.monthlyLimitCents) update.mutate({ monthlyLimitCents: cents });
  }

  return (
    <li className="grid gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          maxLength={80}
          className="h-8 min-w-0 flex-1 basis-full font-medium sm:basis-auto"
          aria-label={`Name of ${category.name}`}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Limit €</span>
          <Input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={saveLimit}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            inputMode="decimal"
            placeholder="none"
            className="h-8 w-24 text-right"
            aria-label={`${category.name} monthly limit in euros`}
            aria-invalid={error !== null}
          />
        </div>
        <Button variant="ghost" size="icon-sm" disabled={!above} onClick={() => above && swap.mutate(above)} aria-label={`Move ${category.name} up`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={!below} onClick={() => below && swap.mutate(below)} aria-label={`Move ${category.name} down`}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => remove.mutate(undefined)} className="text-muted-foreground hover:text-destructive">
          Remove
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function ArchivedCategory({ category }: { category: CategoryRow }) {
  const restore = useMoneyAction(() => moneyApi.updateCategory(category.id, { archived: false }), `${category.name} restored`);
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{category.name}</span>
      <Button variant="ghost" size="sm" onClick={() => restore.mutate(undefined)}>
        Restore
      </Button>
    </div>
  );
}

// ---- Bills ----------------------------------------------------------------

function BillsTab() {
  const bills = useBills();
  const categories = useCategories();
  const names = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const active = (bills.data ?? []).filter((b) => b.active);

  return (
    <div className="grid gap-5">
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills yet. Add rent, gym, phone, or subscriptions below.</p>
      ) : (
        <ul className="grid gap-2">
          {active.map((b) => (
            <BillRowItem
              key={b.id}
              bill={b}
              categoryName={names.get(b.categoryId) ?? ""}
              categories={(categories.data ?? []).filter((c) => !c.archived || c.id === b.categoryId)}
            />
          ))}
        </ul>
      )}
      <NewBillForm categories={(categories.data ?? []).filter((c) => !c.archived)} />
    </div>
  );
}

function BillRowItem({ bill, categoryName, categories }: { bill: BillRow; categoryName: string; categories: CategoryRow[] }) {
  const [editing, setEditing] = useState(false);
  const undo = useMoneyUndo();
  // The toast lives in the mutation itself: this row unmounts once the refetch drops the stopped bill.
  const stop = useMoneyAction(async () => {
    await moneyApi.stopBill(bill.id);
    toast(`${bill.name} stopped`, {
      action: { label: "Undo", onClick: () => undo(() => moneyApi.updateBill(bill.id, { active: true })) },
    });
  });
  const stopBill = () => stop.mutate(undefined);

  if (editing) return <EditBillForm bill={bill} categories={categories} onDone={() => setEditing(false)} />;
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{bill.name}</span>
        <span className="text-xs text-muted-foreground">
          Day {bill.dayOfMonth} of each month, {categoryName}
        </span>
      </span>
      <span className="tabular-nums">{formatEuro(bill.amountCents)}</span>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" onClick={stopBill} disabled={stop.isPending} className="text-muted-foreground hover:text-destructive">
        Stop
      </Button>
    </li>
  );
}

function EditBillForm({ bill, categories, onDone }: { bill: BillRow; categories: CategoryRow[]; onDone: () => void }) {
  const [name, setName] = useState(bill.name);
  const [amount, setAmount] = useState((bill.amountCents / 100).toFixed(2));
  const [day, setDay] = useState(String(bill.dayOfMonth));
  const [categoryId, setCategoryId] = useState(bill.categoryId);
  const [error, setError] = useState<string | null>(null);
  const save = useMoneyAction(
    (patch: Parameters<typeof moneyApi.updateBill>[1]) => moneyApi.updateBill(bill.id, patch),
    `${bill.name} updated`,
  );
  const id = (field: string) => `eb-${field}-${bill.id}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseEuroToCents(amount);
    const d = Number(day);
    if (!name.trim()) return setError("Give the bill a name, like Rent");
    if (cents === null) return setError("Enter an amount like 750");
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError("Day must be 1 to 31");
    save.mutate(
      { name: name.trim(), amountCents: cents, dayOfMonth: d, categoryId },
      { onSuccess: onDone, onError: (err) => setError(err.message) },
    );
  }

  return (
    <li>
      <form onSubmit={submit} className="grid gap-3 rounded-lg bg-muted/40 p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_7rem_5rem]">
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <Label htmlFor={id("name")}>Name</Label>
            <Input id={id("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={id("amount")}>Amount (€)</Label>
            <Input id={id("amount")} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={id("day")}>Day</Label>
            <Input id={id("day")} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("cat")}>Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id={id("cat")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Changes apply from the next due date. Expenses already logged keep their amount.</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </li>
  );
}

function NewBillForm({ categories }: { categories: CategoryRow[] }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const [categoryId, setCategoryId] = useState<string>("");
  const [startsOn, setStartsOn] = useState(berlinToday());
  const [error, setError] = useState<string | null>(null);
  const create = useMoneyAction((v: Parameters<typeof moneyApi.createBill>[0]) => moneyApi.createBill(v), "Bill added");

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseEuroToCents(amount);
    const d = Number(day);
    if (!name.trim()) return setError("Give the bill a name, like Rent");
    if (cents === null) return setError("Enter an amount like 750");
    if (!Number.isInteger(d) || d < 1 || d > 31) return setError("Day must be 1 to 31");
    if (!categoryId) return setError("Pick a category");
    create.mutate(
      { name: name.trim(), amountCents: cents, dayOfMonth: d, categoryId, startsOn },
      {
        onSuccess: () => {
          setName("");
          setAmount("");
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Add a bill</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_7rem_5rem]">
        <div className="col-span-2 grid gap-1.5 sm:col-span-1">
          <Label htmlFor="nb-name">Name</Label>
          <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nb-amount">Amount (€)</Label>
          <Input id="nb-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nb-day">Day</Label>
          <Input id="nb-day" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nb-cat">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="nb-cat">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nb-start">Starts</Label>
          <Input id="nb-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="[color-scheme:dark]" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Days past the end of a short month land on its last day.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="justify-self-start" disabled={create.isPending}>
        Add bill
      </Button>
    </form>
  );
}
