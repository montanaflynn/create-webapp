"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { getBanInfo } from "./get-ban-info";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const formSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [passkeyPending, setPasskeyPending] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  // Conditional UI: when the browser supports it, opening the email field
  // triggers the system passkey picker as an autofill suggestion. Safe to
  // call unconditionally — better-auth no-ops if there are no passkeys.
  //
  // Side effect we suppress: better-auth's passkey client logs ceremony
  // failures via console.error even when they're expected. AbortError fires
  // when the explicit button or unmount aborts the autofill ceremony;
  // NotSupportedError fires in headless browsers and on platforms without a
  // passkey authenticator (also seen in Playwright's chromium). Neither is a
  // real bug — we patch console.error for the page lifetime to drop both,
  // and restore on unmount.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential?.isConditionalMediationAvailable
    ) {
      return;
    }
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      const [first, second] = args;
      const errName = (second as { name?: string } | null)?.name;
      if (
        first === "[Better Auth] Error verifying passkey" &&
        (errName === "AbortError" || errName === "NotSupportedError")
      ) {
        return;
      }
      origError.apply(console, args as Parameters<typeof console.error>);
    };

    let cancelled = false;
    window.PublicKeyCredential.isConditionalMediationAvailable().then(
      (ok) => {
        if (cancelled || !ok) return;
        void signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess: () => {
              router.push(redirectTo);
              router.refresh();
            },
          },
        });
      },
    );
    return () => {
      cancelled = true;
      console.error = origError;
    };
  }, [router, redirectTo]);

  async function onPasskeyClick() {
    setPasskeyPending(true);
    const res = await signIn.passkey();
    setPasskeyPending(false);
    // res can be undefined on user-cancel; only treat a real error object as failure
    if (res && "error" in res && res.error) {
      toast.error(res.error.message ?? "Passkey sign-in failed");
      return;
    }
    if (res && "data" in res && res.data) {
      router.push(redirectTo);
      router.refresh();
    }
  }

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const { error } = await signIn.email(values);
    if (error) {
      // better-auth returns a static `bannedUserMessage` for banned users —
      // it doesn't include the per-user reason. Look the reason up ourselves
      // and surface it. error.code is "BANNED" when the user is banned.
      if (error.code === "BANNED") {
        const info = await getBanInfo(values.email);
        const reason = info?.reason?.trim();
        const expires = info?.expiresAt
          ? ` (until ${new Date(info.expiresAt).toLocaleString()})`
          : "";
        toast.error(
          reason
            ? `Your account is suspended: ${reason}${expires}`
            : `Your account is suspended${expires}`,
        );
        return;
      }
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <h1 className="sr-only">Sign in</h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Welcome back</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    // "webauthn" must be the last token; enables conditional UI
                    autoComplete="email webauthn"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting || passkeyPending}
            >
              {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
            <div className="flex w-full items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">OR</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onPasskeyClick}
              disabled={passkeyPending || form.formState.isSubmitting}
            >
              <KeyRound aria-hidden />
              {passkeyPending ? "Waiting for passkey…" : "Sign in with passkey"}
            </Button>
            <p className="text-sm text-muted-foreground">
              No account?{" "}
              <Link href="/sign-up" className="underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </Card>
      </form>
    </>
  );
}
