export class EmailService {
  static async sendOrderPaidEmail({
    userId,
    amount,
  }: {
    userId: string;
    amount: number;
  }) {
    // TODO:
    // Replace with Nodemailer, Resend, SendGrid, etc.

    console.log(
      `Payment confirmation email sent to user ${userId} for ₹${amount}`,
    );
  }
}
