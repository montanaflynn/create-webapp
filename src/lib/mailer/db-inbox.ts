import { db } from "@/lib/db";
import { devEmail } from "@/lib/db/schema";
import type { Mailer } from "./index";

function id() {
  return `eml_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export const dbInboxMailer: Mailer = {
  name: "db-inbox",
  async send(msg) {
    await db.insert(devEmail).values({
      id: id(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      kind: msg.kind,
      meta: msg.meta ?? null,
    });
  },
};
