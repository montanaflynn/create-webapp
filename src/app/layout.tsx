import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AxeReporter } from "@/components/axe-reporter";
import { SiteHeader } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { SocialLinks } from "@/components/social-links";
import { APP_NAME, APP_DESCRIPTION, THEME } from "@/lib/branding";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-base={THEME.base}
      data-accent={THEME.accent}
      data-radius={THEME.radius}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SiteHeader user={session?.user ?? null} />
          {children}
          <footer className="border-t">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-sm text-muted-foreground sm:px-6">
              <span>© {new Date().getFullYear()} {APP_NAME}</span>
              <div className="flex items-center gap-1">
                <SocialLinks />
                <ThemeToggle />
              </div>
            </div>
          </footer>
          <Toaster richColors />
          <AxeReporter />
        </ThemeProvider>
      </body>
    </html>
  );
}
