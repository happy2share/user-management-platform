export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { verifyEmailOtp } from "../../../lib/app-email";
import { resetUserPassword } from "../../../lib/activation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim();
    const otp = String(body.otp || "").replace(/\D/g, "");
    const newPassword = body.newPassword;

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

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 1) {
      return NextResponse.json(
        { error: "New password is required" },
        { status: 400 },
      );
    }

    // Verify the OTP strictly (forceCheck: true ensures no bypass even if emailVerified is true)
    const { userId, enabled } = await verifyEmailOtp({
      identifier,
      otp,
      forceCheck: true,
    });

    if (enabled === false) {
      return NextResponse.json(
        { error: "This account is disabled. Contact an administrator." },
        { status: 403 },
      );
    }

    // Reset the password via Keycloak Admin API
    await resetUserPassword(userId, newPassword, false);

    return NextResponse.json({
      message: "Password has been reset successfully. You can now login with your new password.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Password reset failed",
      },
      { status: 500 },
    );
  }
}
