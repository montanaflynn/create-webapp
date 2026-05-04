"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { revokeConnectedAppAction } from "./actions";

export type SerializedConnectedApp = {
  tokenId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

export function ConnectedAppsList({
  apps,
}: {
  apps: SerializedConnectedApp[];
}) {
  if (apps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No connected apps yet. Apps you authorize will appear here.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {apps.map((a) => (
        <li
          key={a.tokenId}
          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm font-medium">{a.clientName}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex flex-wrap gap-1">
                {a.scopes.length === 0 ? (
                  <span>(no scopes)</span>
                ) : (
                  a.scopes.map((s) => (
                    <Badge key={s} variant="outline" className="font-mono text-[10px]">
                      {s}
                    </Badge>
                  ))
                )}
              </span>
              <span>·</span>
              <span>{lastUsedLabel(a.lastUsedAt)}</span>
              <span>·</span>
              <span>
                Connected {new Date(a.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <RevokeButton tokenId={a.tokenId} name={a.clientName} />
        </li>
      ))}
    </ul>
  );
}

function lastUsedLabel(iso: string | null): string {
  if (!iso) return "Never used";
  return `Last used ${new Date(iso).toLocaleDateString()}`;
}

function RevokeButton({ tokenId, name }: { tokenId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        aria-label={`Revoke ${name}`}
      >
        <Trash2Icon aria-hidden />
        Revoke
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this connection?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{name}</span> will lose access
            immediately. They&rsquo;ll need to authorize again to reconnect.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await revokeConnectedAppAction(tokenId);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Connection revoked");
                router.refresh();
              })
            }
          >
            {pending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
