import { useMemo, useState } from "react";
import { MAX_ACTIVE_PROJECTS } from "@shared/rules";
import type { Project } from "@shared/schemas";
import { ActiveBoard, ActiveBoardSkeleton } from "@/components/active-board";
import { ProjectDialog } from "@/components/project-dialog";
import { ProjectList, ProjectListSkeleton } from "@/components/project-list";
import { ShipDialog } from "@/components/ship-dialog";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeeklyReview } from "@/components/weekly-review";
import { useProjects, useStats } from "@/hooks/queries";

type EditState = { project?: Project } | null;

export default function ProjectsPage() {
  const projects = useProjects();
  const stats = useStats();
  const [editing, setEditing] = useState<EditState>(null);
  const [shipping, setShipping] = useState<Project | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const groups = useMemo(() => {
    const all = projects.data ?? [];
    return {
      active: all.filter((p) => p.status === "active"),
      parked: all.filter((p) => p.status === "parked"),
      stale: all
        .filter((p) => p.status !== "archived" && p.stale)
        .sort((a, b) => a.lastTouched.localeCompare(b.lastTouched)),
    };
  }, [projects.data]);

  const openNew = () => setEditing({});
  const openEdit = (project: Project) => setEditing({ project });

  return (
    <>
      <div className="grid gap-12">
        <TopBar stats={stats.data} statsLoading={stats.isPending} onNew={openNew} onReview={() => setReviewing(true)} />

        {projects.isError ? (
          <div role="alert" className="grid justify-items-start gap-3 rounded-xl bg-card p-6 shadow-[inset_0_0_0_1px_var(--border)]">
            <p className="font-medium">Could not load projects</p>
            <p className="text-sm text-muted-foreground">{projects.error.message}</p>
            <Button variant="secondary" size="sm" onClick={() => projects.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="active">
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="active">
                Active
                <Count>
                  {groups.active.length}/{MAX_ACTIVE_PROJECTS}
                </Count>
              </TabsTrigger>
              <TabsTrigger value="parked">
                Parked
                <Count>{groups.parked.length}</Count>
              </TabsTrigger>
              <TabsTrigger value="stale">
                Stale
                <Count highlight={groups.stale.length > 0}>{groups.stale.length}</Count>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {projects.isPending ? (
                <ActiveBoardSkeleton />
              ) : (
                <ActiveBoard projects={groups.active} onEdit={openEdit} onShip={setShipping} onNew={openNew} />
              )}
            </TabsContent>

            <TabsContent value="parked">
              {projects.isPending ? (
                <ProjectListSkeleton />
              ) : (
                <ProjectList
                  projects={groups.parked}
                  onEdit={openEdit}
                  empty={{ title: "Nothing parked", body: "Parked projects wait here until a slot opens up." }}
                />
              )}
            </TabsContent>

            <TabsContent value="stale">
              {projects.isPending ? (
                <ProjectListSkeleton />
              ) : (
                <ProjectList
                  projects={groups.stale}
                  onEdit={openEdit}
                  variant="stale"
                  empty={{ title: "Nothing stale", body: "Every project was touched in the last 30 days." }}
                />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <ProjectDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        project={editing?.project}
        projects={projects.data}
      />
      <ShipDialog project={shipping} onOpenChange={(o) => !o && setShipping(null)} />
      <WeeklyReview open={reviewing} onOpenChange={setReviewing} active={groups.active} />
    </>
  );
}

function Count({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span className={highlight ? "font-mono text-xs text-ship" : "font-mono text-xs text-muted-foreground"}>{children}</span>
  );
}
