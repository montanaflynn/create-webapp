import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

// Admin gate. proxy.ts already redirects unauthenticated users; this layout
// re-checks the session and 404s for non-admins so the route's existence
// isn't disclosed.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const role = (session.user as { role?: string | null }).role ?? "user";
  if (role !== "admin") notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <AdminNav />
      {children}
    </main>
  );
}
