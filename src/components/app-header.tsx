"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LogOutIcon,
  Monitor,
  Moon,
  NotebookIcon,
  SettingsIcon,
  ShieldIcon,
  Sun,
  TagIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HeaderUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
};

const baseNav = [
  { title: "Notes", href: "/dashboard", icon: NotebookIcon },
  { title: "Tags", href: "/tags", icon: TagIcon },
  { title: "Settings", href: "/settings", icon: SettingsIcon },
] as const;

const adminNav = {
  title: "Admin",
  href: "/admin/users",
  icon: ShieldIcon,
} as const;

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function AppHeader({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const nav = user.role === "admin" ? [...baseNav, adminNav] : baseNav;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="font-semibold tracking-tight whitespace-nowrap"
        >
          create-webapp
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
                aria-label={item.title}
              >
                <item.icon className="size-4 sm:mr-1.5" aria-hidden />
                <span className="hidden sm:inline">{item.title}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <UserDropdown user={user} />
        </div>
      </div>
    </header>
  );
}

function UserDropdown({ user }: { user: HeaderUser }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "rounded-full",
        )}
        aria-label="Open user menu"
      >
        <Avatar className="size-7">
          <AvatarImage src={user.image ?? undefined} alt={user.name} />
          <AvatarFallback className="text-xs font-medium text-foreground">
            {initialsOf(user.name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="flex flex-col gap-0.5 px-1.5 py-1.5">
          <span className="text-sm font-medium leading-none">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={setTheme}
          >
            <DropdownMenuRadioItem value="light">
              <Sun className="mr-2" /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="mr-2" /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="mr-2" /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            const { signOut } = await import("@/lib/auth-client");
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOutIcon className="mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
