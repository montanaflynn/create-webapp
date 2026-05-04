/**
 * Single source of truth for app identity. Edit here when forking.
 *
 * NOTE: APP_NAME flows into the WebAuthn `rpName` (see `src/lib/auth.ts`).
 * Renaming after users have registered passkeys can invalidate them on
 * some authenticators — change before launch, not after.
 */
export const APP_NAME = "create-webapp";
export const APP_DESCRIPTION =
  "Next.js + better-auth + Drizzle + shadcn starter";

/**
 * Social links shown in the footer. Set to an empty string to hide a link;
 * the footer only renders entries with a non-empty URL.
 */
export const SOCIALS = {
  github: "https://github.com/montanaflynn/create-webapp",
  x: "",
  linkedin: "",
  instagram: "",
} as const;

export type SocialKey = keyof typeof SOCIALS;

/**
 * Theme axes. Presets live in `globals.css` keyed off `data-base`,
 * `data-accent`, and `data-radius` on `<html>`.
 *
 * - `base`   — neutral palette (background, foreground, muted, border, …)
 * - `accent` — brand color used by `--primary`, `--ring`, `--sidebar-primary`
 * - `radius` — corner radius scale; affects every `rounded-*` class
 *
 * For finer-grained control (shadcn's full token surface, charts, sidebar,
 * fonts), edit `globals.css` directly or design in tweakcn and paste the
 * preset code into `npx shadcn add --preset ...`.
 */
export type BaseColor = "neutral" | "zinc" | "slate" | "stone" | "gray";
export type Accent = "zinc" | "indigo" | "blue" | "rose" | "green";
export type Radius = "sharp" | "default" | "round";

export interface Theme {
  base: BaseColor;
  accent: Accent;
  radius: Radius;
}

export const THEME: Theme = {
  base: "neutral",
  accent: "zinc",
  radius: "default",
};
