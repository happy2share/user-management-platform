export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { findUserByUsernameOrEmail } from "../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../lib/app-email";

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists with that username or email, a reset code has been sent.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim();

    if (!identifier) {
      return NextResponse.json(
        { error: "Username or email is required" },
        { status: 400 },
      );
    }

    const user = await findUserByUsernameOrEmail(identifier);

    if (!user?.id || !user.email) {
      // Return generic message to avoid user enumeration
      return NextResponse.json({
        message: GENERIC_SUCCESS_MESSAGE,
      });
    }

    if (user.enabled === false) {
      return NextResponse.json(
        { error: "This account is disabled. Contact an administrator." },
        { status: 403 },
      );
    }

    const verification = await sendEmailVerification(user);

    return NextResponse.json({
      message: GENERIC_SUCCESS_MESSAGE,
      emailSent: verification.emailSent,
      localOtpCode: verification.localOtpCode,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send password reset code",
      },
      { status: 500 },
    );
  }
}
