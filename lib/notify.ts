/**
 * Outbound messaging to drivers.
 *
 * Default behaviour is to LOG, not send. A real SMS only leaves the building
 * when all three of these are true:
 *
 *   1. FOODLINK_SMS_ENABLED=1                  — operator turned it on
 *   2. TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM  — credentials present
 *   3. the shipment records driverConsent      — that driver agreed to be texted
 *
 * The third one is not decoration. FCC rules put automated and AI-voice calls to
 * mobiles under TCPA, so consent has to be captured per driver and be auditable.
 * Callers pass `consent` explicitly; there is no way to send without it.
 */

export type DeliveryStatus = "LOGGED" | "SENT" | "FAILED" | "SKIPPED";

export type SendResult = {
  status: DeliveryStatus;
  detail: string;
};

const enabled = () => process.env.FOODLINK_SMS_ENABLED === "1";

const twilioConfig = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  return sid && token && from ? { sid, token, from } : null;
};

export function smsMode(): "live" | "logged" {
  return enabled() && twilioConfig() ? "live" : "logged";
}

export async function sendSms(input: {
  to: string | null;
  body: string;
  consent: boolean;
}): Promise<SendResult> {
  const { to, body, consent } = input;

  if (!to) {
    return { status: "SKIPPED", detail: "No phone number on this delivery." };
  }
  if (!consent) {
    return {
      status: "SKIPPED",
      detail: "Driver has not consented to automated messages.",
    };
  }

  const config = twilioConfig();
  if (!enabled() || !config) {
    // The link still works — the dispatcher can pass it on by hand.
    console.info(`[sms:logged] to=${to}\n${body}`);
    return {
      status: "LOGGED",
      detail: enabled()
        ? "SMS enabled but no provider credentials — message logged, not sent."
        : "Sending is off (FOODLINK_SMS_ENABLED is not 1) — message logged, not sent.",
    };
  }

  // NOTE: this path has not been exercised — no credentials were available when
  // it was written. Verify against a Twilio test account before trusting it.
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.sid}:${config.token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: config.from, Body: body }),
      },
    );
    if (!res.ok) {
      const detail = await res.text();
      console.error("[sms:failed]", res.status, detail);
      return { status: "FAILED", detail: `Provider returned ${res.status}.` };
    }
    return { status: "SENT", detail: `Sent to ${to}.` };
  } catch (err) {
    console.error("[sms:error]", err);
    return { status: "FAILED", detail: "Could not reach the SMS provider." };
  }
}
