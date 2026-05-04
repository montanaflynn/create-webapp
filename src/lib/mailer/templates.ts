import type { MailKind } from "./index";
import { APP_NAME } from "@/lib/branding";

interface RenderedMail {
  subject: string;
  html: string;
  text: string;
  kind: MailKind;
  meta: Record<string, unknown>;
}

function layout(title: string, body: string) {
  return `<!doctype html><html><body style="font:14px/1.5 ui-sans-serif,system-ui;color:#111;max-width:560px;margin:24px auto;padding:0 16px"><h1 style="font-size:18px;margin:0 0 16px">${title}</h1>${body}<p style="color:#888;margin-top:24px;font-size:12px">${APP_NAME}</p></body></html>`;
}

function btn(url: string, label: string) {
  return `<p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">${label}</a></p><p style="color:#888;font-size:12px;word-break:break-all">${url}</p>`;
}

export function resetPasswordTemplate(args: {
  user: { email: string; name?: string | null };
  url: string;
}): RenderedMail {
  const subject = `Reset your ${APP_NAME} password`;
  const greeting = args.user.name ? `Hi ${args.user.name},` : "Hi,";
  return {
    kind: "reset-password",
    subject,
    html: layout(
      subject,
      `<p>${greeting}</p><p>Click below to reset your password. The link expires in 1 hour.</p>${btn(args.url, "Reset password")}<p>If you didn't request this, ignore this email.</p>`,
    ),
    text: `${greeting}\n\nReset your password: ${args.url}\n\nThe link expires in 1 hour. If you didn't request this, ignore this email.\n`,
    meta: { url: args.url },
  };
}

export function verifyEmailTemplate(args: {
  user: { email: string; name?: string | null };
  url: string;
}): RenderedMail {
  const subject = `Verify your ${APP_NAME} email`;
  const greeting = args.user.name ? `Hi ${args.user.name},` : "Hi,";
  return {
    kind: "verify-email",
    subject,
    html: layout(
      subject,
      `<p>${greeting}</p><p>Confirm your email address to finish setting up your account.</p>${btn(args.url, "Verify email")}`,
    ),
    text: `${greeting}\n\nVerify your email: ${args.url}\n`,
    meta: { url: args.url },
  };
}

export function changeEmailTemplate(args: {
  user: { email: string; name?: string | null };
  newEmail: string;
  url: string;
}): RenderedMail {
  const subject = `Confirm your new ${APP_NAME} email`;
  const greeting = args.user.name ? `Hi ${args.user.name},` : "Hi,";
  return {
    kind: "change-email",
    subject,
    html: layout(
      subject,
      `<p>${greeting}</p><p>Confirm changing your email to <strong>${args.newEmail}</strong>.</p>${btn(args.url, "Confirm new email")}<p>If you didn't request this, ignore this email — your address won't change.</p>`,
    ),
    text: `${greeting}\n\nConfirm new email (${args.newEmail}): ${args.url}\n`,
    meta: { url: args.url, newEmail: args.newEmail },
  };
}
