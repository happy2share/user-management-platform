export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { verifyPasswordResetOtp } from "../../../lib/app-email";
import { resetUserPassword } from "../../../lib/activation";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";
import {
  clearRateLimitIdentifier,
  rateLimitIdentifier,
} from "../../../lib/redis_utility";

const MIN_PASSWORD_LENGTH = 8;

function isOtpValidationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("password reset code")
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = normalizeObjectTextFields(rawBody, [
      "identifier",
      "username",
      "email",
    ]);
    const identifier = String(
      body.identifier || body.username || body.email || "",
    ).trim();
    const normalizedIdentifier = identifier.toLowerCase();
    const otp = String(rawBody.otp || "").replace(/\D/g, "");
    const newPassword = rawBody.newPassword;

    if (!identifier) {
      return NextResponse.json(
        { error: "Username or email is required" },
        { status: 400 },
      );
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: "A valid 6-digit OTP is required" },
        { status: 400 },
      );
    }

    if (
      !newPassword ||
      typeof newPassword !== "string" ||
      newPassword.length < MIN_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        },
        { status: 400 },
      );
    }

    if (
      await rateLimitIdentifier(
        "password-reset-verify",
        normalizedIdentifier,
        5,
        300,
      )
    ) {
      return NextResponse.json(
        { error: "Too many reset attempts. Try again later." },
        { status: 429 },
      );
    }

    const { userId, enabled } = await verifyPasswordResetOtp(identifier, otp);

    if (enabled === false) {
      return NextResponse.json(
        { error: "This account is disabled. Contact an administrator." },
        { status: 403 },
      );
    }

    // Reset the password via Keycloak Admin API
    await resetUserPassword(userId, newPassword, false);
    await clearRateLimitIdentifier(
      "password-reset-verify",
      normalizedIdentifier,
    );

    return NextResponse.json({
      message:
        "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error: unknown) {
    const otpValidationError = isOtpValidationError(error);
    void logError("Failed to reset password", {
      endpoint: "/api/public/reset-password",
      method: "POST",
      operation: "password.reset",
      error,
    });
    return NextResponse.json(
      {
        error: otpValidationError
          ? "Invalid or expired password reset code"
          : "Password reset failed",
      },
      { status: otpValidationError ? 400 : 500 },
    );
  }
}
