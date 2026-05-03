"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MailIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { title: "Users", href: "/admin/users", icon: UsersIcon },
  { title: "Emails", href: "/admin/inbox", icon: MailIcon },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex items-center gap-1 border-b -mt-2 pb-2">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}
