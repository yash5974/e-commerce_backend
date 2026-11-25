import {
  EmailTemplate,
  OrderPaidEmailPayload,
  PasswordResetOtpEmailPayload,
  PaymentFailedEmailPayload,
} from "../types/email.types.js";

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return value.replace(/[&<>"']/g, (character) => {
    return entities[character] ?? character;
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount);
}

function emailLayout(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>

      <body style="
        margin: 0;
        padding: 24px;
        background-color: #f4f4f5;
        font-family: Arial, Helvetica, sans-serif;
      ">
        <div style="
          max-width: 600px;
          margin: 0 auto;
          padding: 32px;
          background-color: #ffffff;
          border-radius: 12px;
        ">
          ${content}

          <hr style="
            margin-top: 32px;
            border: 0;
            border-top: 1px solid #e5e7eb;
          " />

          <p style="
            color: #6b7280;
            font-size: 12px;
            text-align: center;
          ">
            This is an automated email from our store.
          </p>
        </div>
      </body>
    </html>
  `;
}

export const emailTemplates = {
  orderPaid(payload: OrderPaidEmailPayload): EmailTemplate {
    const name = escapeHtml(payload.customerName);
    const orderId = escapeHtml(payload.orderId);
    const amount = escapeHtml(formatCurrency(payload.amount, payload.currency));

    return {
      subject: "Payment successful - Order confirmed",

      text: [
        `Hello ${payload.customerName},`,
        "",
        "Your payment has been received successfully.",
        "",
        `Order ID: ${payload.orderId}`,
        `Amount paid: ${formatCurrency(payload.amount, payload.currency)}`,
        "",
        "Thank you for shopping with us!",
      ].join("\n"),

      html: emailLayout(`
        <h1 style="color: #16a34a;">
          Payment Successful!
        </h1>

        <p>Hello ${name},</p>

        <p>
          Your payment has been received successfully.
          Your order is confirmed.
        </p>

        <div style="
          padding: 20px;
          margin: 24px 0;
          background-color: #f9fafb;
          border-radius: 8px;
        ">
          <p>
            <strong>Order ID:</strong>
            ${orderId}
          </p>

          <p>
            <strong>Amount Paid:</strong>
            ${amount}
          </p>
        </div>

        <p>Thank you for shopping with us!</p>
      `),
    };
  },

  paymentFailed(payload: PaymentFailedEmailPayload): EmailTemplate {
    const name = escapeHtml(payload.customerName);
    const orderId = escapeHtml(payload.orderId);
    const amount = escapeHtml(formatCurrency(payload.amount, payload.currency));

    return {
      subject: "Payment failed - Please try again",

      text: [
        `Hello ${payload.customerName},`,
        "",
        "Unfortunately, your payment could not be completed.",
        "",
        `Order ID: ${payload.orderId}`,
        `Amount: ${formatCurrency(payload.amount, payload.currency)}`,
        "",
        "Your order is still pending payment. You can retry your payment.",
      ].join("\n"),

      html: emailLayout(`
        <h1 style="color: #dc2626;">
          Payment Failed
        </h1>

        <p>Hello ${name},</p>

        <p>
          Unfortunately, your payment could not be completed.
        </p>

        <div style="
          padding: 20px;
          margin: 24px 0;
          background-color: #f9fafb;
          border-radius: 8px;
        ">
          <p>
            <strong>Order ID:</strong>
            ${orderId}
          </p>

          <p>
            <strong>Amount:</strong>
            ${amount}
          </p>
        </div>

        <p>
          Your order is still pending payment.
          You can retry the payment from your account.
        </p>
      `),
    };
  },

  passwordResetOtp(payload: PasswordResetOtpEmailPayload) {
    const customerName = escapeHtml(payload.customerName);
    const otp = escapeHtml(payload.otp);
    const expiresInMinutes = payload.expiresInMinutes;

    const subject = "Password Reset OTP";

    const text = `
                  Hello ${payload.customerName},

                  We received a request to reset your password.

                  Your OTP is: ${payload.otp}

                  This OTP expires in ${expiresInMinutes} minutes.

                  If you did not request a password reset, please ignore this email.

                  Do not share this OTP with anyone.

                  Thank you
                  `;

    const html = emailLayout(`
    <h2>Password Reset Request</h2>

    <p>Hello ${customerName},</p>

    <p>
      We received a request to reset your password.
      Use the OTP below to continue.
    </p>

    <div style="
      margin: 24px 0;
      padding: 20px;
      background-color: #f3f4f6;
      border-radius: 8px;
      text-align: center;
    ">
      <h1 style="
        font-size: 32px;
        letter-spacing: 8px;
        margin: 0;
        color: #111827;
      ">
        ${otp}
      </h1>
    </div>

    <p>
      This OTP expires in
      <strong>${expiresInMinutes} minutes</strong>.
    </p>

    <p>
      Do not share this OTP with anyone.
    </p>

    <p>
      If you did not request a password reset,
      you can safely ignore this email.
    </p>
  `);

    return { subject, text, html };
  },
};
