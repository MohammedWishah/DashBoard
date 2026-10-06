import { lazy, Suspense, type ReactNode } from "react";
import { Route, Switch } from "wouter";
import { LockSimple } from "@phosphor-icons/react";
import { FEATURE_LABELS, type Feature } from "@shared/features";
import { AppShell } from "@/components/app-shell";
import { useMe } from "@/hooks/me";
import HomePage from "@/routes/home";
import ProjectsPage from "@/routes/projects";

// Money pulls in the chart library, so it loads on first visit instead of up front.
const MoneyPage = lazy(() => import("@/routes/money"));
const PlannerPage = lazy(() => import("@/routes/planner"));
const PeoplePage = lazy(() => import("@/routes/people"));

/** Renders a section only for people who have it. The API enforces the same rule. */
function Gate({ feature, adminOnly, children }: { feature?: Feature; adminOnly?: boolean; children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <div className="min-h-14" />;
  const allowed = adminOnly ? me.data.isAdmin : !feature || me.data.features.includes(feature);
  if (allowed) return <Suspense fallback={<div className="min-h-14" />}>{children}</Suspense>;
  return (
    <div className="grid justify-items-start gap-2 py-16">
      <LockSimple className="size-6 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{feature ? `${FEATURE_LABELS[feature]} isn't on for you` : "Admins only"}</h1>
      <p className="text-sm text-muted-foreground">Ask the admin to turn it on.</p>
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/money">
          <Gate feature="money">
            <MoneyPage />
          </Gate>
        </Route>
        <Route path="/planner">
          <Gate feature="planner">
            <PlannerPage />
          </Gate>
        </Route>
        <Route path="/projects">
          <Gate feature="projects">
            <ProjectsPage />
          </Gate>
        </Route>
        <Route path="/people">
          <Gate adminOnly>
            <PeoplePage />
          </Gate>
        </Route>
        <Route>
          <div className="grid justify-items-start gap-2 py-16">
            <h1 className="text-xl font-semibold">Page not found</h1>
            <a href="/" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Go to Home
            </a>
          </div>
        </Route>
      </Switch>
    </AppShell>
  );
}
