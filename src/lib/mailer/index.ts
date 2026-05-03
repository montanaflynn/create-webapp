import { dbInboxMailer } from "./db-inbox";
import { resendMailer } from "./resend";
import { consoleMailer } from "./console";

export type MailKind =
  | "reset-password"
  | "verify-email"
  | "change-email"
  | "other";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  kind: MailKind;
  /** Free-form. URLs/tokens here will be redacted before any console logging. */
  meta?: Record<string, unknown>;
}

export interface Mailer {
  readonly name: "db-inbox" | "resend" | "console";
  send(msg: MailMessage): Promise<void>;
}

function pickMailer(): Mailer {
  const override = process.env.EMAIL_TRANSPORT_OVERRIDE?.trim();
  if (override === "db-inbox") return dbInboxMailer;
  if (override === "resend") return resendMailer;
  if (override === "console") return consoleMailer;
  if (process.env.RESEND_API_KEY?.trim()) return resendMailer;
  return dbInboxMailer;
}

let _mailer: Mailer | undefined;
function getMailer(): Mailer {
  return (_mailer ??= pickMailer());
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const to = process.env.FORCE_TO_OVERRIDE?.trim() || msg.to;
  const meta =
    to !== msg.to
      ? { ...(msg.meta ?? {}), originalTo: msg.to, forced: true }
      : msg.meta;
  const m = getMailer();
  // Always log the dispatch, never the URL/token — they're the credential.
  console.log(`[mailer:${m.name}] → ${to} · ${msg.kind} · ${msg.subject}`);
  await m.send({ ...msg, to, meta });
}
