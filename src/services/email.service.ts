import { emailConfig } from "../config/email.config.js";
import { environment } from "../config/env.js";
import type {
  SendEmailPayload,
  OrderPaidEmailPayload,
  PaymentFailedEmailPayload,
  EmailSendResult,
  PasswordResetOtpEmailPayload,
} from "../types/email.types.js";
import { emailTemplates } from "../utils/email.templates.js";

export const EmailService = {
  async sendEmail(payload: SendEmailPayload): Promise<EmailSendResult | null> {
    if (!emailConfig.enabled) {
      console.info("Email sending skipped: email service disabled.");
      return null;
    }

    const recipient = payload.to.trim();

    if (!recipient) {
      throw new Error("Email recipient is required.");
    }

    const result = await emailConfig.transporter.sendMail({
      from: environment.EMAIL_FROM_ADDRESS,
      to: recipient,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    console.log("result: ", result);

    const accepted = result.accepted.map(String);
    console.log("accepted: ", accepted);
    const rejected = result.rejected.map(String);
    console.log("rejected: ", rejected);

    const recipientAccepted = accepted.some(
      (address) => address.toLowerCase() === recipient.toLowerCase(),
    );
    console.log("recipientAccepted: ", recipientAccepted);

    if (!recipientAccepted) {
      throw new Error("SMTP did not accept the email recipient.");
    }

    console.info("Email sent:", result.messageId);

    return {
      messageId: result.messageId,
      accepted,
      rejected,
    };
  },

  async sendOrderPaidEmail(
    payload: OrderPaidEmailPayload,
  ): Promise<EmailSendResult | null> {
    const template = emailTemplates.orderPaid(payload);

    return EmailService.sendEmail({
      to: payload.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  },

  async sendPaymentFailedEmail(
    payload: PaymentFailedEmailPayload,
  ): Promise<EmailSendResult | null> {
    const template = emailTemplates.paymentFailed(payload);

    return EmailService.sendEmail({
      to: payload.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  },

  async sendPasswordResetOtpEmail(
    payload: PasswordResetOtpEmailPayload,
  ): Promise<EmailSendResult | null> {
    const template = emailTemplates.passwordResetOtp(payload);

    return EmailService.sendEmail({
      to: payload.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  },
};
