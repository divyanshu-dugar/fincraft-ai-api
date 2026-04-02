const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a password reset email with a one-time link.
 * @param {string} to    – recipient email
 * @param {string} token – raw (unhashed) reset token
 */
exports.sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1e293b; font-size: 24px; margin: 0;">Fincraft AI</h1>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Password Reset Request</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px;">
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
          We received a request to reset your password. Click the button below to choose a new password.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 15px;">
            Reset Password
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">
          This link expires in <strong>15 minutes</strong>. If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      </div>
      <p style="color: #cbd5e1; font-size: 12px; text-align: center; margin-top: 24px;">
        Fincraft AI · Secure Financial Management
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Fincraft AI" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset your Fincraft AI password',
    html,
  });
};
