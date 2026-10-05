import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex items-center gap-1 sm:gap-2">{children}</div>}
    </div>
  );
}
