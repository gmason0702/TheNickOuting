import { Resend } from "resend";
import { env } from "./env";
import type { EmailContent } from "./templates";

export async function sendEmail(to: string, content: EmailContent): Promise<void> {
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({
    from: env.emailFrom,
    to,
    subject: content.subject,
    html: content.html,
  });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}
