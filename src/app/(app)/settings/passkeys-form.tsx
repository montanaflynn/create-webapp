"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type PasskeyRow = {
  id: string;
  name: string | null;
  createdAt: string | null;
};

export function PasskeysForm({ passkeys }: { passkeys: PasskeyRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onAdd() {
    setAdding(true);
    // Default name = "<UA>-<short>". Users almost always accept the default,
    // and the renamer is in the per-row menu (future) — keep it simple here.
    const defaultName = defaultPasskeyName();
    const res = await authClient.passkey.addPasskey({
      name: defaultName,
      // "platform" = Touch ID / Windows Hello / Android. Cross-platform
      // (security keys) still works as a fallback if the user picks one.
      authenticatorAttachment: "platform",
    });
    setAdding(false);
    if (res?.error) {
      // User cancellation surfaces as a generic DOM error — don't toast it
      if (
        res.error.message?.includes("cancel") ||
        res.error.message?.includes("aborted")
      ) {
        return;
      }
      toast.error(res.error.message ?? "Could not register passkey");
      return;
    }
    toast.success("Passkey added");
    startTransition(() => router.refresh());
  }

  async function onDelete(id: string) {
    setDeletingId(id);
    const res = await authClient.passkey.deletePasskey({ id });
    setDeletingId(null);
    if (res?.error) {
      toast.error(res.error.message ?? "Could not remove passkey");
      return;
    }
    toast.success("Passkey removed");
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkeys</CardTitle>
        <CardDescription>
          Sign in without a password using your device&rsquo;s biometrics or a
          security key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&rsquo;t registered any passkeys yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {passkeys.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <KeyRound
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {p.name ?? "Unnamed passkey"}
                    </div>
                    {p.createdAt && (
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(p.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(p.id)}
                  disabled={deletingId === p.id}
                  aria-label={`Remove passkey ${p.name ?? ""}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={onAdd} disabled={adding}>
          <KeyRound aria-hidden />
          {adding ? "Waiting for device…" : "Add passkey"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function defaultPasskeyName() {
  if (typeof navigator === "undefined") return "Passkey";
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua)) return "Mac";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS device";
  if (/Android/.test(ua)) return "Android device";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Passkey";
}
