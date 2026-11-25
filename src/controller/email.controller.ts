import type { Request, Response } from "express";
import { sendTestEmailSchema } from "../schema/email.schema.js";
import { ValidationError } from "../errors/domain.errors.js";
import { EmailService } from "../services/email.service.js";

export async function sendTestEmail(
  req: Request,
  res: Response,
): Promise<Response> {
  const parsed = sendTestEmailSchema.safeParse(req.body);

  if (!parsed.success) {
    throw new ValidationError("Invalid recipient email.");
  }

  const result = await EmailService.sendEmail({
    to: parsed.data.email,
    subject: "Nodemailer configuration test",
    text: "Your SMTP configuration is working successfully.",
    html: `
      <h1>Email configuration verified!</h1>
      <p>Your Nodemailer SMTP configuration is working successfully.</p>
    `,
  });

  return res.status(200).json({
    success: true,
    message: result
      ? "Test email sent successfully."
      : "Email sending is disabled.",
    data: result,
  });
}
