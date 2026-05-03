"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { confirmEmailChangeAction } from "./actions";

export function ConfirmForm({
  token,
  newEmail,
  currentEmail,
}: {
  token: string;
  newEmail: string;
  currentEmail: string;
}) {
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === newEmail.toLowerCase();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await confirmEmailChangeAction(fd);
      } catch (err) {
        // redirect() throws a NEXT_REDIRECT — let it bubble.
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">
        Confirm changing your account email from{" "}
        <strong className="text-foreground">{currentEmail}</strong> to{" "}
        <strong className="text-foreground">{newEmail}</strong>.
      </p>
      <Field>
        <FieldLabel htmlFor="typedEmail">
          Type the new email to confirm
        </FieldLabel>
        <Input
          id="typedEmail"
          name="typedEmail"
          type="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          required
        />
        <FieldDescription>
          Makes sure you read the address before confirming.
        </FieldDescription>
        {typed && !matches && (
          <FieldError errors={[{ message: "Doesn't match the pending email." }]} />
        )}
      </Field>
      <Button type="submit" disabled={pending || !matches}>
        {pending ? "Confirming…" : "Confirm change"}
      </Button>
    </form>
  );
}
