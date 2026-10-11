import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, SignOut, Trash } from "@phosphor-icons/react";
import { formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/components/auth/auth-gate";
import { TransferButtons } from "@/components/transfer-buttons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountApi } from "@/lib/api";

const tokenKey = ["agent-tokens"] as const;

export function AccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { email, guest, signOut } = useAuth();
  const [confirmWipe, setConfirmWipe] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>
            {guest ? "You're trying Life Board as a guest. Your data is saved only in this browser." : `Signed in as ${email}`}
          </DialogDescription>
        </DialogHeader>

        {open && !guest && <VoiceTokens />}

        <section className="grid gap-2 border-t border-border/70 pt-5">
          <h3 className="text-sm font-semibold">Backup</h3>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {guest
                ? "Download your guest data as one file. You can restore it into a real account later."
                : "Download or restore all your projects and money as one file."}
            </p>
            <div className="flex shrink-0">
              <TransferButtons />
            </div>
          </div>
        </section>

        {guest ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void signOut()}>
              <SignOut />
              Leave guest mode
            </Button>
            <Button
              variant={confirmWipe ? "destructive" : "ghost"}
              onClick={() => (confirmWipe ? void signOut({ wipe: true }) : setConfirmWipe(true))}
              onBlur={() => setConfirmWipe(false)}
            >
              <Trash />
              {confirmWipe ? "Delete for good?" : "Delete guest data"}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => void signOut()} className="justify-self-start">
            <SignOut />
            Sign out
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VoiceTokens() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: tokenKey, queryFn: accountApi.tokens });
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (n: string) => accountApi.createToken(n),
    onSuccess: (t) => {
      setFresh(t.token);
      setName("");
      qc.invalidateQueries({ queryKey: tokenKey });
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => accountApi.revokeToken(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tokenKey }),
    onError: (e) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(fresh!);
      toast.success("Token copied");
    } catch {
      toast.error("Copy failed. Select the token and copy it by hand.");
    }
  }

  return (
    <section className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">Voice assistant</h3>
        <p className="text-sm text-muted-foreground">
          A token lets an assistant read your next actions and money, and ship projects, as you. Send it as{" "}
          <code className="text-foreground">Authorization: Bearer</code>.
        </p>
      </div>

      {fresh && (
        <div className="grid gap-2 rounded-lg border border-ship/40 bg-ship/5 p-3">
          <p className="text-xs text-muted-foreground">Copy it now. It won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">{fresh}</code>
            <Button size="icon-sm" variant="secondary" onClick={copy} aria-label="Copy token">
              <Copy />
            </Button>
          </div>
        </div>
      )}

      {(tokens.data ?? []).length > 0 && (
        <ul className="grid gap-1.5">
          {tokens.data!.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t.lastUsedAt ? `Used ${formatDistanceToNowStrict(new Date(t.lastUsedAt))} ago` : "Never used"}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => revoke.mutate(t.id)} className="text-muted-foreground hover:text-destructive">
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="tok-name" className="sr-only">
            Token name
          </Label>
          <Input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Kitchen speaker" maxLength={60} />
        </div>
        <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
          Create
        </Button>
      </form>
    </section>
  );
}
