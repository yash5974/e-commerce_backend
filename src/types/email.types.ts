export interface SendEmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface OrderPaidEmailPayload {
  email: string;
  customerName: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface PaymentFailedEmailPayload {
  email: string;
  customerName: string;
  orderId: string;
  amount: number;
  currency: string;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface PasswordResetOtpEmailPayload {
  email: string;
  customerName: string;
  otp: string;
  expiresInMinutes: number;
}
