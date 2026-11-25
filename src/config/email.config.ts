import { environment } from "./env.js";
import nodemailer from "nodemailer";
export const emailConfig = {
  enabled: environment.EMAIL_ENABLED,

  transporter: nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: Number(environment.SMTP_PORT),
    secure: environment.SMTP_SECURE === false,

    auth: {
      user: environment.SMTP_USER,
      pass: environment.SMTP_PASSWORD,
    },

    // Reuse SMTP connections
    pool: true,
    maxConnections: 3,
    maxMessages: 100,

    // Prevent requests hanging indefinitely
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,

    tls: {
      minVersion: "TLSv1.2",
    },
  }),
};

export async function verifyEmailConnection(): Promise<void> {
  if (!emailConfig.enabled) {
    console.info("Email service is disabled.");
    return;
  }

  try {
    await emailConfig.transporter.verify();

    console.info("Email SMTP connection verified.");
  } catch (error: unknown) {
    console.error("Email SMTP verification failed:", error);
  }
}
