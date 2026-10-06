import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LinkSimple, Plus } from "@phosphor-icons/react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { formatEuro, parseEuroToCents, waitHours } from "@shared/money";
import type { WantRow } from "@shared/money-schemas";
import { panel } from "@/components/money/summary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories, useMoneyAction, useWants } from "@/hooks/money";
import { moneyApi } from "@/lib/money-api";
import { cn } from "@/lib/utils";

/** Re-render every minute so "ready in 3 hours" stays honest. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function WantList() {
  const wants = useWants();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState<WantRow | null>(null);
  const skip = useMoneyAction((id: string) => moneyApi.skipWant(id));
  const remove = useMoneyAction((id: string) => moneyApi.deleteWant(id));
  // Skip and remove wait 5 seconds before reaching the server, so Undo really undoes.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  function later(item: WantRow, action: "skip" | "remove") {
    setHidden((s) => new Set(s).add(item.id));
    const timer = setTimeout(() => (action === "skip" ? skip.mutate(item.id) : remove.mutate(item.id)), 5000);
    toast(action === "skip" ? `Skipped ${item.name}. Saved ${formatEuro(item.priceCents)} by waiting.` : `Removed ${item.name}`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer);
          setHidden((s) => {
            const next = new Set(s);
            next.delete(item.id);
            return next;
          });
        },
      },
    });
  }
  const w = wants.data;
  const waiting = (w?.waiting ?? []).filter((item) => !hidden.has(item.id));

  return (
    <section className={cn(panel, "grid content-start gap-4 p-5")} aria-labelledby="wants-title">
      <header className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="wants-title" className="text-sm font-semibold">
            Want list
          </h2>
          {w && w.savedCents > 0 && <p className="text-xs text-muted-foreground">Saved by waiting: {formatEuro(w.savedCents)}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus />
          Want
        </Button>
      </header>
      {adding && <AddWant onDone={() => setAdding(false)} />}
      {!w ? null : waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">Want something? Put it here first. Under €50 waits a day, up to €200 three days, more a week.</p>
      ) : (
        <ul className="grid gap-3">
          {waiting.map((item) => {
            const ready = Date.parse(item.readyAt) <= now;
            return (
              <li key={item.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate font-medium">
                    {item.name}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={`Open link for ${item.name}`}>
                        <LinkSimple className="size-3.5" />
                      </a>
                    )}
                  </span>
                  <span className="tabular-nums">{formatEuro(item.priceCents)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-xs", ready ? "text-primary" : "text-muted-foreground")}>
                    {ready ? "Ready to decide" : `Ready in ${formatDistanceToNowStrict(parseISO(item.readyAt))}`}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => later(item, "skip")} aria-label={`Skip ${item.name}`}>
                      Skip
                    </Button>
                    <Button variant={ready ? "secondary" : "ghost"} size="sm" onClick={() => setBuying(item)} aria-label={`Buy ${item.name}`}>
                      Buy
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => later(item, "remove")} aria-label={`Remove ${item.name}`}>
                      ×
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <BuyDialog want={buying} now={now} onClose={() => setBuying(null)} />
    </section>
  );
}

function AddWant({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMoneyAction((v: { name: string; priceCents: number; url: string | null }) => moneyApi.createWant(v));
  const cents = parseEuroToCents(price);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || cents === null) return setError("Add a name and a price");
    create.mutate({ name: name.trim(), priceCents: cents, url: url.trim() || null }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg bg-muted/40 p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="What do you want?" maxLength={120} aria-label="Item" />
      <div className="flex gap-2">
        <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price €" inputMode="decimal" className="w-28" aria-label="Price in euros" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Link (optional)" aria-label="Link" />
      </div>
      {cents !== null && <p className="text-xs text-muted-foreground">You can decide in {waitHours(cents) / 24 === 1 ? "1 day" : `${waitHours(cents) / 24} days`}.</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={create.isPending}>
          Add to list
        </Button>
      </div>
    </form>
  );
}

function BuyDialog({ want, now, onClose }: { want: WantRow | null; now: number; onClose: () => void }) {
  const categories = useCategories();
  const active = (categories.data ?? []).filter((c) => !c.archived);
  const [categoryId, setCategoryId] = useState<string>("");
  const buy = useMoneyAction((v: { id: string; categoryId: string }) => moneyApi.buyWant(v.id, { categoryId: v.categoryId }), "Bought. Logged as an expense.");
  const forWant = useRef<string | null>(null);
  useEffect(() => {
    if (!want) return;
    // Same default as Quick add: the last category used, else Other. Runs again once categories
    // load, but never overrides a choice already made for this want.
    let last: string | null = null;
    try {
      last = localStorage.getItem("quick-add:last-category");
    } catch {
      /* private mode */
    }
    const fallback = active.find((c) => c.id === last)?.id ?? active.find((c) => c.name === "Other")?.id ?? active[0]?.id ?? "";
    const keep = forWant.current === want.id;
    setCategoryId((cur) => (keep && cur && active.some((c) => c.id === cur) ? cur : fallback));
    forWant.current = want.id;
  }, [want?.id, active.length]);
  const early = want ? Date.parse(want.readyAt) > now : false;

  return (
    <Dialog open={want !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Buy {want?.name}?</DialogTitle>
          <DialogDescription>
            {early && want
              ? `Still ${formatDistanceToNowStrict(parseISO(want.readyAt))} to go. Buy anyway?`
              : `This logs ${want ? formatEuro(want.priceCents) : ""} as an expense today.`}
          </DialogDescription>
        </DialogHeader>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label="Category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {active.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button
            disabled={!categoryId || buy.isPending}
            onClick={() => want && buy.mutate({ id: want.id, categoryId }, { onSuccess: onClose })}
          >
            {early ? "Buy anyway" : "Buy"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
