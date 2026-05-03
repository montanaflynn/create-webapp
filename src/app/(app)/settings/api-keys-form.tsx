"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { CopyIcon, KeyRoundIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createKey,
  revokeKey,
  type SerializedApiKey,
} from "./api-keys-actions";

const SCOPES = [
  { value: "notes:read", label: "Read notes" },
  { value: "notes:write", label: "Write notes" },
  { value: "tags:read", label: "Read tags" },
] as const;

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(80, "Name must be at most 80 characters."),
  scopes: z
    .array(z.string())
    .min(1, "Select at least one scope."),
});

type FormValues = z.infer<typeof formSchema>;

export function ApiKeysForm({ keys }: { keys: SerializedApiKey[] }) {
  const router = useRouter();
  const [createdSecret, setCreatedSecret] = useState<{
    secret: string;
    key: SerializedApiKey;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", scopes: SCOPES.map((s) => s.value) },
  });

  async function onSubmit(values: FormValues) {
    const res = await createKey(values);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCreatedSecret({ secret: res.secret, key: res.key });
    form.reset({ name: "", scopes: SCOPES.map((s) => s.value) });
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Personal access tokens for the REST API. Use them from CLIs, MCP
            servers, or scripts. The full secret is shown once at creation —
            save it somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {createdSecret && (
            <CreatedKeyBanner
              secret={createdSecret.secret}
              keyMeta={createdSecret.key}
              onDismiss={() => setCreatedSecret(null)}
            />
          )}

          <KeyList keys={keys} />

          <div className="space-y-4 border-t pt-6">
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="api-key-name">Key name</FieldLabel>
                  <Input
                    {...field}
                    id="api-key-name"
                    placeholder="my-cli"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="scopes"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Scopes</FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SCOPES.map((s) => {
                      const checked = field.value.includes(s.value);
                      return (
                        <label
                          key={s.value}
                          className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              const set = new Set(field.value);
                              if (next === true) set.add(s.value);
                              else set.delete(s.value);
                              field.onChange(Array.from(set));
                            }}
                            aria-label={s.label}
                            className="mt-0.5"
                          />
                          <div>
                            <div className="font-medium">{s.label}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {s.value}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <KeyRoundIcon aria-hidden />
            {form.formState.isSubmitting ? "Creating…" : "Create API key"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function CreatedKeyBanner({
  secret,
  keyMeta,
  onDismiss,
}: {
  secret: string;
  keyMeta: SerializedApiKey;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy — select and copy manually.");
    }
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium">
        <TriangleAlertIcon className="size-4 text-amber-600" aria-hidden />
        Save this secret — it won&rsquo;t be shown again.
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md border bg-background px-3 py-2 font-mono text-xs">
          {secret}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <CopyIcon aria-hidden />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{keyMeta.name}</span>{" "}
        · scopes: {keyMeta.scopes.join(", ") || "(none)"}
      </p>
      <div className="mt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          I&rsquo;ve saved it
        </Button>
      </div>
    </div>
  );
}

function KeyList({ keys }: { keys: SerializedApiKey[] }) {
  if (keys.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven&rsquo;t created any API keys yet.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {keys.map((k) => (
        <li
          key={k.id}
          className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{k.name}</span>
              {k.revokedAt && (
                <Badge variant="secondary" className="text-xs">
                  Revoked
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <code className="font-mono">{k.prefix}…</code>
              <span>·</span>
              <span>
                {k.scopes.length === 0 ? "(no scopes)" : k.scopes.join(", ")}
              </span>
              <span>·</span>
              <span>{lastUsedLabel(k.lastUsedAt)}</span>
              <span>·</span>
              <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          {!k.revokedAt && <RevokeButton id={k.id} name={k.name} />}
        </li>
      ))}
    </ul>
  );
}

function lastUsedLabel(iso: string | null): string {
  if (!iso) return "Never used";
  return `Last used ${new Date(iso).toLocaleDateString()}`;
}

function RevokeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        aria-label={`Revoke API key ${name}`}
      >
        <Trash2Icon aria-hidden />
        Revoke
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this API key?</AlertDialogTitle>
          <AlertDialogDescription>
            Any clients using <span className="font-medium">{name}</span> will
            stop working immediately. This can&rsquo;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await revokeKey(id);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success("API key revoked");
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
