export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { verifyEmailOtp } from "../../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../../i18n/english-normalizer";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "../../../../lib/redis_utility";

function isOtpValidationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Invalid email verification code") ||
    error.message.includes("Email verification code expired") ||
    error.message.includes("6-digit email OTP")
  );
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const identifier = String(
      body.username || rawBody.email || rawBody.identifier || "",
    )
      .trim()
      .toLowerCase();
    if (
      await rateLimitIdentifier("email-verify", identifier || "missing", 5, 300)
    ) {
      return NextResponse.json(
        {
          verified: false,
          error: "Too many verification attempts. Try again later.",
        },
        { status: 429 },
      );
    }
    const result = await verifyEmailOtp({
      username: body.username,
      email: rawBody.email,
      identifier: rawBody.identifier,
      otp: rawBody.otp || rawBody.code,
      token: rawBody.token,
    });
    await clearRateLimitIdentifier("email-verify", identifier);

    return NextResponse.json({
      verified: true,
      message: result.alreadyVerified
        ? "Email is already verified. Return to IAM Platform and continue."
        : "Email verified successfully. Return to IAM Platform and complete MFA setup.",
      ...result,
    });
  } catch (error: unknown) {
    const otpValidationError = isOtpValidationError(error);
    void logError("Failed to verify email OTP", {
      endpoint: "/api/public/email-verification/verify",
      method: "POST",
      operation: "emailVerification.verify",
      error,
    });
    return NextResponse.json(
      {
        verified: false,
        error: otpValidationError
          ? "Invalid or expired email verification code"
          : "Failed to verify email OTP",
      },
      { status: otpValidationError ? 400 : 500 },
    );
  }
}
