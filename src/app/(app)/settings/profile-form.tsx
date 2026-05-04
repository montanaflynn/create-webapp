"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cancelEmailChangeAction } from "./email/confirm/actions";

const formSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(120, "Name must be at most 120 characters."),
  email: z.email("Enter a valid email address."),
});

interface PendingChange {
  newEmail: string;
  expiresAt: string;
}

export function ProfileForm({
  initialName,
  email,
  pending,
}: {
  initialName: string;
  email: string;
  pending: PendingChange | null;
}) {
  const router = useRouter();
  const [cancelPending, startCancel] = useTransition();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: initialName, email },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const nextName = values.name.trim();
    const nextEmail = values.email.trim().toLowerCase();
    const nameChanged = nextName !== initialName;
    const emailChanged = nextEmail !== email.toLowerCase();

    if (!nameChanged && !emailChanged) return;

    if (nameChanged) {
      const { error } = await authClient.updateUser({ name: nextName });
      if (error) {
        toast.error(error.message ?? "Failed to update name");
        return;
      }
    }

    if (emailChanged) {
      const { error } = await authClient.changeEmail({
        newEmail: nextEmail,
        callbackURL: "/settings",
      });
      if (error) {
        toast.error(error.message ?? "Failed to start email change");
        return;
      }
      toast.success(
        `Confirmation sent to ${email}. Click the link to switch to ${nextEmail}.`,
      );
      form.resetField("email", { defaultValue: email });
    }

    if (nameChanged) {
      toast.success("Profile updated");
      form.reset({ name: nextName, email: emailChanged ? email : nextEmail });
    }

    router.refresh();
  }

  function onCancel() {
    startCancel(async () => {
      try {
        await cancelEmailChangeAction();
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  const { isSubmitting } = form.formState;
  const watchedEmail = useWatch({ control: form.control, name: "email" });
  const emailWillChange =
    !pending &&
    watchedEmail.trim().length > 0 &&
    watchedEmail.trim().toLowerCase() !== email.toLowerCase();

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your display name and email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p className="font-medium">Email change pending</p>
              <p className="mt-1 text-muted-foreground">
                We sent a confirmation link to{" "}
                <strong className="text-foreground">{email}</strong> — open it
                to switch to{" "}
                <strong className="text-foreground">{pending.newEmail}</strong>.
                The link expires{" "}
                {new Date(pending.expiresAt).toLocaleString()}.
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  disabled={cancelPending}
                >
                  {cancelPending ? "Cancelling…" : "Cancel change"}
                </Button>
              </div>
            </div>
          )}
          {emailWillChange && (
            <div
              role="status"
              className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
            >
              <p className="font-medium">Confirmation required</p>
              <p className="mt-1 text-muted-foreground">
                Saving sends a confirmation link to{" "}
                <strong className="text-foreground">{email}</strong>. Your
                address won&rsquo;t change until you open it and re-type the
                new one.
              </p>
            </div>
          )}
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  autoComplete="email"
                  aria-invalid={fieldState.invalid}
                  disabled={!!pending}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : pending ? (
                  <FieldDescription>
                    Cancel the pending change to update again.
                  </FieldDescription>
                ) : null}
              </Field>
            )}
          />
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
