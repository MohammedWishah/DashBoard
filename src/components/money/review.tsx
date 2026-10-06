import { ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import { addMonths, formatEuro, type MonthReview } from "@shared/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { monthName, panel, shortDate } from "./summary";

const short = (m: string) => monthName(m).split(" ")[0];

/** "€70.00 less" in the accent, "€40.00 more" plain: spending less is the good direction. */
function Delta({ cents, against }: { cents: number; against: string }) {
  if (cents === 0) return <span className="text-muted-foreground">Same as {against}</span>;
  const less = cents < 0;
  return (
    <span className={cn("inline-flex items-center gap-1", less ? "text-primary" : "text-muted-foreground")}>
      {less ? <ArrowDown className="size-3" weight="bold" aria-hidden /> : <ArrowUp className="size-3" weight="bold" aria-hidden />}
      {formatEuro(Math.abs(cents))} {less ? "less" : "more"} than {against}
    </span>
  );
}

function CategoryChange({ spent, previous }: { spent: number; previous: number }) {
  if (previous === 0) return <span className="text-muted-foreground">new</span>;
  const diff = spent - previous;
  if (diff === 0) return <span className="text-muted-foreground">same</span>;
  return (
    <span className={diff < 0 ? "text-primary" : "text-muted-foreground"}>
      {diff < 0 ? "−" : "+"}
      {formatEuro(Math.abs(diff))}
    </span>
  );
}

export function ReviewCard({
  review,
  showSavedByWaiting,
  onDismiss,
}: {
  review: MonthReview;
  showSavedByWaiting: boolean;
  onDismiss?: () => void;
}) {
  const t = review.totals;
  const before = short(addMonths(review.month, -1));
  const stats = [
    { label: "Left over", value: formatEuro(t.leftCents), bad: t.leftCents < 0 },
    { label: "Saved", value: formatEuro(t.savedCents), bad: false },
    ...(showSavedByWaiting && review.savedByWaitingCents > 0
      ? [{ label: "Saved by waiting", value: formatEuro(review.savedByWaitingCents), bad: false }]
      : []),
  ];

  return (
    <section className={cn(panel, "grid gap-5 p-5")} aria-labelledby="review-title">
      <header className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="review-title" className="text-sm font-semibold">
            {monthName(review.month)} in review
          </h2>
          <p className="text-sm">
            <span className="font-medium tabular-nums">Spent {formatEuro(t.expenseCents)}</span>
            {review.expenseDeltaCents !== null && (
              <span className="text-xs">
                <span className="text-muted-foreground"> · </span>
                <Delta cents={review.expenseDeltaCents} against={before} />
              </span>
            )}
          </p>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label={`Hide the ${monthName(review.month)} review`}>
            <X />
          </Button>
        )}
      </header>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
        {stats.map((s) => (
          <div key={s.label} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className={cn("text-base font-medium tabular-nums", s.bad && "text-status-critical")}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {review.topCategories.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Where most of it went</h3>
          <ul className="grid gap-1.5">
            {review.topCategories.map((c) => (
              <li key={c.categoryId} className="flex items-baseline gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="tabular-nums">{formatEuro(c.spentCents)}</span>
                <span className="w-20 text-right text-xs tabular-nums">
                  <CategoryChange spent={c.spentCents} previous={c.previousCents} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        {review.limits.total > 0 && (
          <span>
            Limits kept: <span className="text-foreground">{review.limits.kept} of {review.limits.total}</span>
          </span>
        )}
        {review.biggest && (
          <span>
            Biggest: <span className="text-foreground">{review.biggest.label}</span> {formatEuro(review.biggest.amountCents)} on{" "}
            {shortDate(review.biggest.spentOn)}
          </span>
        )}
        <span>
          {review.expenseCount} {review.expenseCount === 1 ? "expense" : "expenses"} logged
        </span>
      </p>
    </section>
  );
}

export function ReviewSkeleton() {
  return <Skeleton className="h-56 rounded-xl" />;
}
