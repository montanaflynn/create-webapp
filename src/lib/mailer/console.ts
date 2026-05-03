import type { Mailer } from "./index";

export const consoleMailer: Mailer = {
  name: "console",
  async send(msg) {
    console.log(
      `\n--- email ---\nto: ${msg.to}\nsubject: ${msg.subject}\nkind: ${msg.kind}\n\n${msg.text}\n-------------\n`,
    );
  },
};
