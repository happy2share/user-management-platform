export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { findUserByUsernameOrEmail } from "../../../lib/keycloak-users";
import { sendPasswordResetOtp } from "../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";
import { rateLimitIdentifier } from "../../../lib/redis_utility";

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists with that username or email, a reset code has been sent.";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = normalizeObjectTextFields(rawBody, ["identifier", "username"]);
    const identifier = String(
      body.identifier || body.username || rawBody.email || "",
    ).trim();
    const normalizedIdentifier = identifier.toLowerCase();

    if (!identifier) {
      return NextResponse.json(
        { error: "Username or email is required" },
        { status: 400 },
      );
    }

    if (
      await rateLimitIdentifier("forgot-password", normalizedIdentifier, 5, 300)
    ) {
      return NextResponse.json(
        { error: "Too many reset requests. Try again later." },
        { status: 429 },
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
      return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
    }

    await sendPasswordResetOtp(user);

    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  } catch (error: unknown) {
    void logError("Failed to start forgot-password flow", {
      endpoint: "/api/public/forgot-password",
      method: "POST",
      operation: "password.forgot",
      error,
    });
    return NextResponse.json({ message: GENERIC_SUCCESS_MESSAGE });
  }
}
