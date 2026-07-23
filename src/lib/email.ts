import "server-only";

/**
 * Sends a signup OTP. Uses Resend's REST API when RESEND_API_KEY is set
 * (no SDK/dependency needed); otherwise logs the code to the server console
 * so signup is testable locally without an email provider.
 */
export async function sendOtp(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.OTP_FROM || "onboarding@resend.dev";

  if (!key) {
    console.log(`\n[OTP] verification code for ${email}: ${code}\n`);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: "Your JobTrack verification code",
        text: `Your JobTrack verification code is ${code}. It expires in 10 minutes.`,
      }),
    });
    if (!res.ok) {
      console.error(`[OTP] Resend failed (${res.status}); code for ${email}: ${code}`);
    }
  } catch (err) {
    console.error(`[OTP] send error; code for ${email}: ${code}`, err);
  }
}
