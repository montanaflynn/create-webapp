"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/api-keys", label: "API keys" },
  { href: "/settings/oauth-clients", label: "MCP clients" },
  { href: "/settings/activity", label: "Activity" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections">
      <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0.5">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
