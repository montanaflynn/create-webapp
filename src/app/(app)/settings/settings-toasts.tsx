"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Reads ?email-changed=1 / ?email-cancelled=1 from the URL after
// confirm/cancel actions and surfaces a toast, then clears the params so
// reloading doesn't fire again.
export function SettingsToasts({
  emailChanged,
  emailCancelled,
}: {
  emailChanged: boolean;
  emailCancelled: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (emailChanged) {
      toast.success("Email changed");
      router.replace("/settings");
    } else if (emailCancelled) {
      toast.success("Email change cancelled");
      router.replace("/settings");
    }
    // emailChanged/emailCancelled flip at most once per render; safe deps.
  }, [emailChanged, emailCancelled, router]);
  return null;
}
