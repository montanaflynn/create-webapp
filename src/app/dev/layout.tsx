import { notFound } from "next/navigation";

// Dev-only inbox surface. In production this returns a 404 — staging that needs
// inspection should expose the same data via /admin/inbox once admin RBAC lands.
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
