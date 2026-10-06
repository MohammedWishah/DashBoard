import type { EnergyLevel } from "@shared/energy";
import { useSetEnergy } from "@/hooks/planner";
import { cn } from "@/lib/utils";

const LEVELS: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "low" },
  { value: "ok", label: "ok" },
  { value: "high", label: "high" },
];

/** One tap a day. Tapping the chosen level again clears it. */
export function EnergyChips({ date, level, disabled = false }: { date: string; level: EnergyLevel | null; disabled?: boolean }) {
  const set = useSetEnergy();
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Energy today">
      <span className="text-xs text-muted-foreground">Energy</span>
      {LEVELS.map((l) => {
        const on = level === l.value;
        return (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => set.mutate({ date, level: on ? null : l.value })}
            className={cn(
              "h-7 rounded-full px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50",
              on ? "bg-primary text-primary-foreground" : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground",
            )}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
