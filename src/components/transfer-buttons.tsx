import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useImportData } from "@/hooks/queries";
import { api } from "@/lib/api";

/** Export / import of the whole dashboard (projects and money) as one JSON file. */
export function TransferButtons({ className }: { className?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ fileName: string; data: unknown; projects: number } | null>(null);
  const importData = useImportData();

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-board-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      const projects = Array.isArray((data as { projects?: unknown[] })?.projects)
        ? (data as { projects: unknown[] }).projects.length
        : 0;
      setPending({ fileName: file.name, data, projects });
    } catch {
      toast.error("That file is not valid JSON.");
    }
  }

  function confirmImport() {
    if (!pending) return;
    importData.mutate(pending.data, {
      onSuccess: () => {
        toast.success("Import complete");
        setPending(null);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={exportData} className={className} aria-label="Export JSON" title="Export JSON">
        <DownloadSimple />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} className={className} aria-label="Import JSON" title="Import JSON">
        <UploadSimple />
      </Button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pickFile} />

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Replace all data?</DialogTitle>
            <DialogDescription>
              Importing {pending?.fileName} replaces your projects and money data with what is in the file. Backups from before Money existed only replace projects. Export first if you want a backup.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmImport} disabled={importData.isPending}>
              Replace data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
