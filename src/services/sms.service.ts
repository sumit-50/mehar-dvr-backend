export interface SendSMSResponse {
  status?: string;
  code?: string;
  message?: string;
  messageid?: string;
  error?: string;
}

const SMS_BASE_URL = process.env["SMS_BASE_URL"] || "http://sms.zectagon.cloud";
const SMS_USER = process.env["SMS_USER"] || "mehara";
const SMS_PASSWORD = process.env["SMS_PASSWORD"] || "";
const SENDER_ID = process.env["SMS_SENDER_ID"] || "MEADPL";
const ENTITY_ID = process.env["SMS_ENTITY_ID"] || "1701177530636533436";
const SIGNUP_OTP_TEMPLATE_ID = process.env["SMS_TEMPLATE_ID_SIGNUP_OTP"] || "1707177582389978004";

/**
 * Sends Signup OTP SMS via Zectagon Gateway
 * @param mobile 10-digit mobile number
 * @param otp 6-digit OTP code
 */
export async function sendSignupOTP(mobile: string, otp: string | number): Promise<SendSMSResponse> {
  try {
    // 1. Clean mobile number (keep last 10 digits)
    const cleanMobile = String(mobile).replace(/\D/g, "").slice(-10);
    if (cleanMobile.length !== 10) {
      throw new Error("Invalid mobile number. Exactly 10 digits required.");
    }

    // 2. Exact DLT approved template pattern
    const messageText = `Dear Customer, your OTP for Mehar Finance signup is ${otp}. Do not share it with anyone. - Mehar Advisory`;

    // 3. Build URL parameters
    const params = new URLSearchParams({
      user: SMS_USER,
      password: SMS_PASSWORD,
      senderid: SENDER_ID,
      mobiles: cleanMobile,
      sms: messageText,
      tempid: SIGNUP_OTP_TEMPLATE_ID,
      entityid: ENTITY_ID,
      accusage: "1", // 1: Transactional (OTP)
      responsein: "json",
    });

    const url = `${SMS_BASE_URL}/sendsms.jsp?${params.toString()}`;
    console.log(`[SMS Gateway Dispatch] Sending OTP to +91 ${cleanMobile} via Zectagon (${SMS_BASE_URL})...`);

    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    console.log(`[SMS Gateway Response] Status: ${response.status}, Body: ${text}`);

    let parsedResult: SendSMSResponse;
    try {
      parsedResult = JSON.parse(text);
    } catch {
      // Fallback if response format is CSV text (e.g. status,code,message,messageid)
      const parts = text.split(",");
      parsedResult = {
        status: parts[0]?.trim() || "sent",
        code: parts[1]?.trim(),
        message: parts[2]?.trim() || text,
        messageid: parts[3]?.trim(),
      };
    }

    return parsedResult;
  } catch (error: any) {
    console.error("SMS Gateway Error:", error);
    return { status: "error", error: error.message };
  }
}

export const sendOtpSms = sendSignupOTP;
