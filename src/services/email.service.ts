/**
 * Brevo (Sendinblue) Transactional Email Service
 * Sends transactional emails like Password Reset OTP, verification codes, etc.
 */

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Mehar Advisory Security";
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@meharadvisory.com";

/**
 * Sends a transactional email using Brevo's v3 REST API
 */
export async function sendEmail({
  to,
  subject,
  htmlContent,
  senderName = BREVO_SENDER_NAME,
  senderEmail = BREVO_SENDER_EMAIL,
}: {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  senderName?: string;
  senderEmail?: string;
}): Promise<SendEmailResponse> {
  const apiKey = process.env.BREVO_API_KEY || BREVO_API_KEY;
  const fromEmail = process.env.BREVO_SENDER_EMAIL || senderEmail;
  const fromName = process.env.BREVO_SENDER_NAME || senderName;

  if (!apiKey) {
    console.warn("⚠️ [Brevo Service] BREVO_API_KEY is not set in environment variables.");
    return {
      success: false,
      error: "BREVO_API_KEY is not configured in server environment.",
    };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail,
        },
        to: to.map((t) => ({ email: t.email, name: t.name || t.email })),
        subject: subject,
        htmlContent: htmlContent,
      }),
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      console.error("❌ Brevo API Error:", data);
      return {
        success: false,
        error: data.message || `Brevo returned status code ${response.status}`,
      };
    }

    console.log("✅ Brevo email sent successfully:", data);
    return {
      success: true,
      messageId: data.messageId,
    };
  } catch (error: any) {
    console.error("❌ Brevo Network/Fetch Error:", error);
    return {
      success: false,
      error: error.message || "Failed to communicate with Brevo API",
    };
  }
}

/**
 * Sends a Password Reset OTP Email with premium HTML styling
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  otp: string | number,
  recipientName: string = "User"
): Promise<SendEmailResponse> {
  const subject = `Your Password Reset OTP - Mehar Advisory`;

  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset OTP</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0; }
      .container { max-width: 520px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
      .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 30px 20px; text-align: center; color: #ffffff; }
      .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
      .content { padding: 30px 25px; color: #334155; }
      .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0f172a; }
      .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
      .otp-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
      .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a; margin: 5px 0; font-family: monospace; }
      .otp-label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 1px; }
      .expiry-notice { font-size: 13px; color: #e11d48; font-weight: 500; text-align: center; margin-top: 10px; }
      .security-footer { border-top: 1px solid #e2e8f0; padding: 20px 25px; background: #f8fafc; font-size: 12px; color: #64748b; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Mehar Advisory Services</h1>
      </div>
      <div class="content">
        <div class="greeting">Hello ${recipientName},</div>
        <p class="text">
          We received a request to reset your password for your <strong>Mehar DVR</strong> account. Use the one-time verification code (OTP) below to complete your password reset:
        </p>
        <div class="otp-box">
          <div class="otp-label">Your One-Time Password</div>
          <div class="otp-code">${otp}</div>
          <div class="expiry-notice">⏱️ Valid for 10 minutes only</div>
        </div>
        <p class="text" style="font-size: 13px; color: #64748b;">
          If you did not request this password reset, please ignore this email or reach out to your administrator immediately to secure your account.
        </p>
      </div>
      <div class="security-footer">
        <strong>Security Tip:</strong> Never share your OTP with anyone. Mehar Advisory representatives will never ask for your password or OTP.
      </div>
    </div>
  </body>
  </html>
  `;

  return sendEmail({
    to: [{ email: toEmail, name: recipientName }],
    subject,
    htmlContent,
  });
}
