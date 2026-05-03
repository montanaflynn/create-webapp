"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props extends Omit<React.ComponentProps<"form">, "action"> {
  action: (fd: FormData) => Promise<void>;
  success: string;
}

// Client wrapper around a server action: runs the action in a transition,
// shows a toast on success/error, and disables nested controls while pending.
//
// `className` is forwarded to the inner <fieldset>, not the <form>. The
// fieldset is the actual layout container for children (the form is
// `display: contents`-equivalent because its only direct child is the
// fieldset), so utilities like `space-y-2` need to live on the fieldset
// to take effect on children.
export function ActionForm({
  action,
  success,
  children,
  className,
  ...rest
}: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      {...rest}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            await action(fd);
            toast.success(success);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
    >
      <fieldset
        disabled={pending}
        aria-busy={pending}
        className={cn("min-w-0 border-0 p-0 m-0", className)}
      >
        {children}
      </fieldset>
    </form>
  );
}
