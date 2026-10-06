import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown } from "@phosphor-icons/react";
import { format, parseISO } from "date-fns";
import { BUILT_FEATURES, EXTRA_LABELS, EXTRA_REQUIRES, EXTRAS, FEATURE_LABELS, FEATURES, type Extra, type Feature } from "@shared/features";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { request } from "@/lib/api";
import { cn } from "@/lib/utils";

type Person = { id: string; email: string; createdAt: string; isAdmin: boolean; features: Feature[]; extras: Extra[] };
const key = ["admin", "users"] as const;

export default function PeoplePage() {
  const qc = useQueryClient();
  const people = useQuery({ queryKey: key, queryFn: () => request<{ users: Person[] }>("/admin/users").then((r) => r.users) });
  const save = useMutation({
    // One at a time, so two quick toggles can't undo each other on the server.
    scope: { id: "people-access" },
    mutationFn: ({ id, features, extras }: { id: string; features?: Feature[]; extras?: Extra[] }) =>
      request(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ features, extras }) }),
    onMutate: async ({ id, features, extras }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Person[]>(key);
      qc.setQueryData<Person[]>(key, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...(features && { features }), ...(extras && { extras }) } : p)),
      );
      return { previous };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(key, ctx?.previous);
      toast.error(err.message);
    },
    // /me too: the admin's own extras change what this browser shows.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ["me"] })]),
  });

  function toggle(p: Person, f: Feature) {
    const features = p.features.includes(f) ? p.features.filter((x) => x !== f) : [...p.features, f];
    save.mutate({ id: p.id, features });
  }

  function toggleExtra(p: Person, e: Extra) {
    const extras = p.extras.includes(e) ? p.extras.filter((x) => x !== e) : [...p.extras, e];
    save.mutate({ id: p.id, extras });
  }

  return (
    <div className="grid gap-8">
      <PageHeader title="People" />

      <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
        Choose what each person can use. Everyone only ever sees their own data. To add someone, invite their email in
        Supabase (Authentication, Users, Invite user). They show up here after their first sign-in, with Money and Planner on.
        Extras are small optional helpers; they start off for everyone, you included.
      </p>

      <section className="overflow-hidden rounded-xl bg-card shadow-[inset_0_0_0_1px_var(--border)]">
        {people.isPending ? (
          <div className="grid gap-4 p-5">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-8 w-80" />
          </div>
        ) : people.isError ? (
          <p className="p-5 text-sm text-destructive">{people.error.message}</p>
        ) : (
          <ul>
            {people.data.map((p, i) => (
              <li key={p.id} className={cn("grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", i > 0 && "border-t border-border/70")}>
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 truncate font-medium">
                    {p.email}
                    {p.isAdmin && (
                      <span className="flex items-center gap-1 rounded-sm bg-ship/15 px-1.5 py-px text-[11px] font-medium text-ship">
                        <Crown className="size-3" weight="fill" />
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">Joined {format(parseISO(p.createdAt), "d MMM yyyy")}</span>
                </div>
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Sections for ${p.email}`}>
                    {FEATURES.map((f) => {
                      const on = p.features.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          disabled={p.isAdmin}
                          aria-pressed={on}
                          onClick={() => toggle(p, f)}
                          title={BUILT_FEATURES.includes(f) ? undefined : "Coming soon. Access is ready when it ships."}
                          className={cn(
                            "h-8 rounded-full px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default",
                            on
                              ? "bg-primary text-primary-foreground"
                              : "bg-transparent text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground",
                            p.isAdmin && "opacity-70",
                          )}
                        >
                          {FEATURE_LABELS[f]}
                          {!BUILT_FEATURES.includes(f) && <span className="ml-1 opacity-60">soon</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Extras for ${p.email}`}>
                    <span className="text-xs text-muted-foreground">Extras</span>
                    {EXTRAS.map((e) => {
                      const on = p.extras.includes(e);
                      const needs = EXTRA_REQUIRES[e];
                      const blocked = needs !== null && !p.features.includes(needs);
                      return (
                        <button
                          key={e}
                          type="button"
                          disabled={blocked}
                          aria-pressed={on}
                          onClick={() => toggleExtra(p, e)}
                          title={blocked ? `Needs ${FEATURE_LABELS[needs!]}` : undefined}
                          className={cn(
                            "h-7 rounded-full px-2.5 text-xs font-medium transition-[background-color,color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-40",
                            on
                              ? "bg-primary/90 text-primary-foreground"
                              : "bg-transparent text-muted-foreground shadow-[inset_0_0_0_1px_var(--input)] hover:text-foreground",
                          )}
                        >
                          {EXTRA_LABELS[e]}
                          {blocked && <span className="ml-1 opacity-70">· needs {FEATURE_LABELS[needs!]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
