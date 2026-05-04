"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  useEffect(() => {
    if (emailChanged) {
      toast.success("Email changed");
      router.replace(pathname);
    } else if (emailCancelled) {
      toast.success("Email change cancelled");
      router.replace(pathname);
    }
    // emailChanged/emailCancelled flip at most once per render; safe deps.
  }, [emailChanged, emailCancelled, router, pathname]);
  return null;
}
