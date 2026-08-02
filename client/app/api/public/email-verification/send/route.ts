export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { findUserByUsernameOrEmail } from "../../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../../i18n/english-normalizer";
import { rateLimitIdentifier } from "../../../../lib/redis_utility";

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, ["username"]);
    const identifier = (
      body.username ||
      rawBody.email ||
      rawBody.identifier ||
      ""
    ).trim();

    if (!identifier) {
      return NextResponse.json(
        { error: "Username or email is required" },
        { status: 400 },
      );
    }

    if (
      await rateLimitIdentifier(
        "email-send-lookup",
        identifier.toLowerCase(),
        5,
        300,
      )
    ) {
      return NextResponse.json(
        { error: "Too many verification requests. Try again later." },
        { status: 429 },
      );
    }

    const user = await findUserByUsernameOrEmail(identifier);

    if (!user?.id) {
      return NextResponse.json({
        message: "If the account exists, an email OTP will be sent.",
      });
    }

    if (
      user.emailVerified !== true &&
      !(await rateLimitIdentifier("email-send", user.id, 1, 60))
    ) {
      await sendEmailVerification(user);
    }

    return NextResponse.json({
      message: "If the account exists, an email OTP will be sent.",
    });
  } catch (error: unknown) {
    void logError("Failed to send email verification OTP", {
      endpoint: "/api/public/email-verification/send",
      method: "POST",
      operation: "emailVerification.send",
      error,
    });
    return NextResponse.json(
      { error: "Failed to send email verification OTP" },
      { status: 500 },
    );
  }
}
