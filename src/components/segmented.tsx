import { cn } from "@/lib/utils";

/** Radio group styled like the tab list. Keyboard and screen-reader friendly via native radios. */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted/70 p-1 shadow-[inset_0_0_0_1px_var(--border)]">
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center rounded-md text-sm font-medium transition-[color,background-color,box-shadow] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60",
              checked
                ? "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgba(0,0,0,.3)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
