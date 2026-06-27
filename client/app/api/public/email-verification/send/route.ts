export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { findUserByUsernameOrEmail, getKeycloakError } from "../../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const identifier = (body.username || rawBody.email || rawBody.identifier || "").trim();

    if (!identifier) {
      return NextResponse.json({ error: "Username or email is required" }, { status: 400 });
    }

    const user = await findUserByUsernameOrEmail(identifier);

    if (!user?.id) {
      return NextResponse.json({ message: "If the account exists, an email OTP will be sent." });
    }

    if (user.emailVerified === true) {
      return NextResponse.json({ message: "Email is already verified.", emailVerified: true });
    }

    const verification = await sendEmailVerification(user);

    return NextResponse.json({
      message: verification.emailSent
        ? "Email verification OTP sent. Please check your inbox."
        : "App SMTP is not configured. Use the local OTP shown below for testing.",
      emailVerificationSent: verification.emailSent,
      verificationPageLink: verification.verificationPageLink,
      verificationLink: verification.verificationPageLink,
      localOtpCode: verification.localOtpCode,
      warning: verification.warning,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: await getKeycloakError(error, "Failed to send email verification OTP") },
      { status: 500 },
    );
  }
}
