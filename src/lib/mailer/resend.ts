import type { Mailer } from "./index";

export const resendMailer: Mailer = {
  name: "resend",
  async send(msg) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY missing");
    if (!from) throw new Error("EMAIL_FROM missing");

    // Lazy import so the SDK is optional in dev.
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) throw new Error(`resend: ${error.message}`);
  },
};
