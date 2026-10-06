import { createContext, useContext, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { CalendarCheck, House, Kanban, Plus, UserCircle, UsersThree, Wallet, type Icon } from "@phosphor-icons/react";
import type { Feature } from "@shared/features";
import { AccountDialog } from "@/components/account-dialog";
import { useAuth } from "@/components/auth/auth-gate";
import { Backdrop } from "@/components/backdrop";
import { QuickAdd } from "@/components/money/quick-add";
import { useHasFeature, useMe } from "@/hooks/me";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: Icon; feature?: Feature; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/money", label: "Money", icon: Wallet, feature: "money" },
  { href: "/planner", label: "Planner", icon: CalendarCheck, feature: "planner" },
  { href: "/projects", label: "Projects", icon: Kanban, feature: "projects" },
  { href: "/people", label: "People", icon: UsersThree, adminOnly: true },
];

/** Sections this person can open. Until /me answers, hide gated items rather than flash them. */
function useNav(): NavItem[] {
  const me = useMe().data;
  return NAV.filter((n) => (n.adminOnly ? me?.isAdmin : !n.feature || me?.features.includes(n.feature)));
}

type QuickAddApi = { open: (tab?: "expense" | "income") => void };
const QuickAddContext = createContext<QuickAddApi>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [quickAdd, setQuickAdd] = useState<"expense" | "income" | null>(null);
  const hasMoney = useHasFeature("money");
  const showFab = hasMoney && (location === "/" || location === "/money");
  const [account, setAccount] = useState(false);
  const { email } = useAuth();
  const nav = useNav();

  return (
    <QuickAddContext.Provider value={{ open: (tab = "expense") => setQuickAdd(tab) }}>
      <div className="relative min-h-[100dvh] overflow-x-clip md:pl-56">
        <Backdrop />

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border/60 bg-background/70 px-3 py-4 backdrop-blur-md md:flex">
          <Brand className="px-2" />
          <nav className="mt-8 grid gap-1">
            {nav.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(location, item.href)} />
            ))}
          </nav>
          <button
            type="button"
            onClick={() => setAccount(true)}
            className="mt-auto flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <UserCircle className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{email}</span>
          </button>
        </aside>

        {/* Phone header */}
        <header className="relative z-10 flex h-14 items-center justify-between px-4 md:hidden">
          <Brand />
          <button
            type="button"
            onClick={() => setAccount(true)}
            aria-label="Account"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <UserCircle className="size-6" />
          </button>
        </header>

        <main className="relative mx-auto grid max-w-5xl gap-10 px-4 pb-32 sm:px-6 md:pb-24 md:pt-4 lg:px-8">{children}</main>

        {showFab && (
          <button
            type="button"
            onClick={() => setQuickAdd("expense")}
            aria-label="Add expense"
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_rgba(0,0,0,.6)] transition-transform active:scale-95 md:hidden"
          >
            <Plus className="size-6" weight="bold" />
          </button>
        )}

        {/* Phone bottom bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid auto-cols-fr grid-flow-col border-t border-border/70 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {nav.map(({ href, label, icon: Glyph }) => {
            const active = isActive(location, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Glyph className="size-6" weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            );
          })}
        </nav>

        <AccountDialog open={account} onOpenChange={setAccount} />
        <QuickAdd tab={quickAdd} onTabChange={setQuickAdd} onClose={() => setQuickAdd(null)} />
      </div>
    </QuickAddContext.Provider>
  );
}

function isActive(location: string, href: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}

function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" className="size-6" />
      <span className="text-[15px] font-semibold tracking-tight">Life Board</span>
    </Link>
  );
}

function NavLink({ href, label, icon: Glyph, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Glyph className="size-[18px]" weight={active ? "fill" : "regular"} />
      {label}
    </Link>
  );
}
