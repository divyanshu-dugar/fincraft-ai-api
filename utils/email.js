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

/**
 * Send a budget alert email.
 * @param {string} to         – recipient email
 * @param {string} userName   – display name
 * @param {object} alertData  – { budgetName, type, percentage, currentSpent, budgetAmount, category }
 */
exports.sendBudgetAlertEmail = async (to, userName, alertData) => {
  const { budgetName, type, percentage, currentSpent, budgetAmount, category } = alertData;

  const budgetUrl = `${process.env.FRONTEND_URL}/budget/list`;
  const pct       = Math.min(percentage, 100).toFixed(1);
  const remaining = Math.max(budgetAmount - currentSpent, 0).toFixed(2);

  const isExceeded = type === 'budget_exceeded';
  const isAlmost   = type === 'budget_almost_exceeded';

  const accentColor = isExceeded ? '#ef4444' : isAlmost ? '#f59e0b' : '#3b82f6';
  const badgeBg     = isExceeded ? '#fef2f2' : isAlmost ? '#fffbeb' : '#eff6ff';
  const badgeText   = isExceeded ? '#b91c1c' : isAlmost ? '#92400e' : '#1d4ed8';
  const statusLabel = isExceeded ? '🚨 Budget Exceeded' : isAlmost ? '⚠️ Budget Warning' : '💡 Budget Alert';
  const headline    = isExceeded
    ? `Your <strong>${budgetName}</strong> budget has been exceeded.`
    : isAlmost
    ? `Your <strong>${budgetName}</strong> budget is almost used up.`
    : `Your <strong>${budgetName}</strong> budget has reached its threshold.`;

  // Progress bar width capped at 100%
  const barWidth = Math.min(percentage, 100).toFixed(1);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- Header -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <span style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);border-radius:16px;padding:10px 20px;">
            <span style="color:white;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:900;letter-spacing:-0.5px;">
              Fincraft AI
            </span>
          </span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:white;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">

          <!-- Alert colour bar -->
          <div style="height:5px;background:${accentColor};"></div>

          <div style="padding:32px 32px 28px;">

            <!-- Badge -->
            <div style="margin-bottom:20px;">
              <span style="display:inline-block;background:${badgeBg};color:${badgeText};border-radius:999px;padding:5px 14px;font-size:12px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.3px;">
                ${statusLabel}
              </span>
            </div>

            <!-- Greeting -->
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;color:#64748b;margin:0 0 8px;">
              Hi ${userName},
            </p>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:17px;color:#1e293b;font-weight:600;margin:0 0 24px;line-height:1.5;">
              ${headline}
            </p>

            <!-- Stats row -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="33%" style="text-align:center;padding:16px 8px;background:#f8fafc;border-radius:12px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Spent</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:800;color:#1e293b;">$${Number(currentSpent).toFixed(2)}</div>
                </td>
                <td width="4%"></td>
                <td width="33%" style="text-align:center;padding:16px 8px;background:#f8fafc;border-radius:12px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Budget</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:800;color:#1e293b;">$${Number(budgetAmount).toFixed(2)}</div>
                </td>
                <td width="4%"></td>
                <td width="33%" style="text-align:center;padding:16px 8px;background:${badgeBg};border-radius:12px;">
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${badgeText};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">${isExceeded ? 'Over by' : 'Remaining'}</div>
                  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:20px;font-weight:800;color:${accentColor};">
                    ${isExceeded ? `$${(currentSpent - budgetAmount).toFixed(2)}` : `$${remaining}`}
                  </div>
                </td>
              </tr>
            </table>

            <!-- Progress bar -->
            <div style="margin-bottom:6px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#64748b;">Usage</td>
                  <td style="text-align:right;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:700;color:${accentColor};">${pct}%</td>
                </tr>
              </table>
            </div>
            <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:24px;">
              <div style="height:100%;width:${barWidth}%;background:${accentColor};border-radius:999px;"></div>
            </div>

            ${category ? `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#94a3b8;margin:0 0 24px;">Category: <strong style="color:#475569;">${category}</strong></p>` : ''}

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="${budgetUrl}"
                 style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#6366f1,#3b82f6);color:white;text-decoration:none;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;font-size:14px;">
                View My Budgets
              </a>
            </div>

          </div><!-- /padding -->

          <!-- Footer inside card -->
          <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94a3b8;margin:0;line-height:1.5;">
              You're receiving this because budget notifications are enabled for <strong>${budgetName}</strong>.
              You can adjust notification settings from your budget list.
            </p>
          </div>

        </td></tr><!-- /card -->

        <!-- Footer -->
        <tr><td style="padding-top:20px;text-align:center;">
          <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#cbd5e1;margin:0;">
            Fincraft AI · Secure Financial Management
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `;

  const subjects = {
    budget_exceeded:        `🚨 Budget Exceeded: ${budgetName}`,
    budget_almost_exceeded: `⚠️ Budget Warning: ${budgetName} is ${pct}% used`,
    threshold_reached:      `💡 Budget Alert: ${budgetName}`,
  };

  await transporter.sendMail({
    from:    process.env.SMTP_FROM || `"Fincraft AI" <${process.env.SMTP_USER}>`,
    to,
    subject: subjects[type] || `Budget Alert: ${budgetName}`,
    html,
  });
};

