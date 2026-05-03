import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppHeader } from "@/components/app-header";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="flex flex-1 flex-col">
      {session ? (
        <AppHeader user={session.user} />
      ) : (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
            <Link
              href="/"
              className="font-semibold tracking-tight whitespace-nowrap"
            >
              create-webapp
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "sm" })}
              >
                Get started
              </Link>
            </div>
          </div>
        </header>
      )}

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold tracking-tight">create-webapp</h1>
          <p className="text-xl text-muted-foreground">
            Next.js 16 + better-auth + Drizzle + shadcn/ui starter.
          </p>
          {!session && (
            <div className="flex gap-3 justify-center pt-2">
              <Link
                href="/sign-up"
                className={buttonVariants({ size: "lg" })}
              >
                Get started
              </Link>
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                Sign in
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
