import { NextResponse } from "next/server";
import {
  findUserByUsername,
  getUserOnboardingStatus,
} from "../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const body = normalizeObjectTextFields(await req.json(), ["username"]);
    const username = body.username?.trim();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return NextResponse.json({
        message: "If setup is required, an email will be sent.",
      });
    }

    const onboardingStatus = getUserOnboardingStatus(user);

    if (onboardingStatus === "READY") {
      return NextResponse.json({
        message: "Account setup is already completed.",
      });
    }

    if (onboardingStatus !== "EMAIL_VERIFICATION_REQUIRED") {
      return NextResponse.json({
        message: "Email verification is not the current pending setup step.",
      });
    }

    const verification = await sendEmailVerification(user);

    return NextResponse.json({
      message: verification.emailSent
        ? "Setup email sent. Please check your inbox."
        : "App SMTP is not configured, so use the local email OTP shown below for testing.",
      emailVerificationSent: verification.emailSent,
      verificationPageLink: verification.verificationPageLink,
      localOtpCode: verification.localOtpCode,
      warning: verification.warning,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to resend setup email",
      },
      { status: 500 },
    );
  }
}
