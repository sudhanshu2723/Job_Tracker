import "server-only";
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  }
  return transporter;
}

/**
 * Sends a signup OTP via Gmail SMTP when GMAIL_USER + GMAIL_APP_PASSWORD are set
 * (App Password, not the account password). Otherwise logs the code to the
 * server console so signup is testable locally without email configured.
 */
export async function sendOtp(email: string, code: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[OTP] verification code for ${email}: ${code}\n`);
    return;
  }

  const from = process.env.OTP_FROM || process.env.GMAIL_USER;
  try {
    await t.sendMail({
      from,
      to: email,
      subject: "Your JobTrack verification code",
      text: `Your JobTrack verification code is ${code}. It expires in 10 minutes.`,
    });
  } catch (err) {
    console.error(`[OTP] Gmail send failed; code for ${email}: ${code}`, err);
  }
}
