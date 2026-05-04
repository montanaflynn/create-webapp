import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/branding";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">{APP_NAME}</h1>
        <p className="text-xl text-muted-foreground">{APP_DESCRIPTION}</p>
        {!session && (
          <div className="flex gap-3 justify-center pt-2">
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
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
  );
}
